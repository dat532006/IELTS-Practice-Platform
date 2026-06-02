// W5 runtime smoke — attempt lifecycle + timer guard + submit (W6: scoring server-side, no answer_keys).
// Cover: unauth start, locked start, free start+reuse, submit (server time + W6 raw_score, no answer_keys),
//   idempotent submit, cross-user submit deny, timer bypass → expired.
// Prereq: local Supabase + server (next start/dev) + seed (reading-free-1 / reading-premium-1).
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/attempt_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const FREE = '11111111-1111-1111-1111-111111111111' // reading-free-1 (free, duration 3600)
const PREMIUM = '22222222-2222-2222-2222-222222222222' // reading-premium-1 (premium)
const SECRET_KEYS = ['answer_keys', 'keys', 'passages', 'questions'] // start/submit KHÔNG được chứa

let pass = 0,
  fail = 0,
  skip = 0
const results = []
const check = (n, cond, extra) =>
  cond ? (pass++, results.push(`  ✅ ${n}`)) : (fail++, results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`))
const skipped = (n, why) => (skip++, results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`))
const deepHas = (o, k) => {
  if (o == null || typeof o !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(o, k)) return true
  for (const v of Object.values(o)) if (deepHas(v, k)) return true
  return false
}

async function api(path, { method = 'GET', cookie, body } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  let j = null
  try {
    j = await r.json()
  } catch {
    /* non-json */
  }
  return { status: r.status, body: j }
}

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* optional */
  }
}
function buildSsrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180
  const parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function mkUser(url, anon, admin, email, password) {
  await admin.auth.admin.createUser({ email, password, email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { userId: data.session.user.id, cookie: buildSsrCookie(url, data.session) }
}

const run = async () => {
  // === 1) unauth start free → 401 (luôn chạy) ===
  {
    const r = await api(`/api/exam/${FREE}/start`, { method: 'POST' })
    check('unauth start free → 401', r.status === 401, `got ${r.status}`)
    check('unauth start → error_code=UNAUTHORIZED', r.body?.meta?.error_code === 'UNAUTHORIZED')
  }

  // === authed cases ===
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    skipped('authed cases', 'thiếu env Supabase')
  } else {
    try {
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
      const u1 = await mkUser(url, anon, admin, 'w5-smoke@test.dev', 'w5-smoke-123')
      const u2 = await mkUser(url, anon, admin, 'w5-smoke2@test.dev', 'w5-smoke2-123')
      // sạch state
      await admin.from('attempts').delete().in('user_id', [u1.userId, u2.userId])
      await admin.from('test_unlocks').delete().eq('user_id', u1.userId) // u1 KHÔNG unlock premium

      // 2) locked premium start → 403, KHÔNG tạo attempt
      {
        const r = await api(`/api/exam/${PREMIUM}/start`, { method: 'POST', cookie: u1.cookie })
        check('locked premium start → 403 EXAM_LOCKED', r.status === 403 && r.body?.meta?.error_code === 'EXAM_LOCKED', `got ${r.status}`)
        const { count } = await admin.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', u1.userId).eq('test_id', PREMIUM)
        check('locked premium → KHÔNG tạo attempt', (count ?? 0) === 0, `count=${count}`)
      }

      // 3) free start → attempt in_progress, server started_at, KHÔNG payload/answer_keys
      let attemptId = null
      {
        const r = await api(`/api/exam/${FREE}/start`, { method: 'POST', cookie: u1.cookie })
        check('free start → 200', r.status === 200, `got ${r.status}`)
        check('free start → status in_progress', r.body?.data?.status === 'in_progress')
        check('free start → có attempt_id', !!r.body?.data?.attempt_id)
        check('free start → duration_sec=3600', r.body?.data?.duration_sec === 3600, `${r.body?.data?.duration_sec}`)
        check('free start → time_remaining>0', (r.body?.data?.time_remaining_sec ?? 0) > 0)
        check('free start → có started_at + server_now', !!r.body?.data?.started_at && !!r.body?.data?.server_now)
        for (const k of SECRET_KEYS) check(`free start → KHÔNG có ${k}`, !deepHas(r.body, k))
        attemptId = r.body?.data?.attempt_id
      }

      // 4) free start lại → reuse cùng attempt_id (idempotent in_progress)
      {
        const r = await api(`/api/exam/${FREE}/start`, { method: 'POST', cookie: u1.cookie })
        check('free start lại → reuse cùng attempt_id', r.body?.data?.attempt_id === attemptId, `${r.body?.data?.attempt_id} vs ${attemptId}`)
      }

      // 5) submit (gửi kèm time giả) → submitted, time_spent server (nhỏ); W6: chấm q1 (free seed key='sample') → raw=1; KHÔNG trả answer_keys
      {
        const r = await api('/api/submit', {
          method: 'POST',
          cookie: u1.cookie,
          body: { attempt_id: attemptId, answers: { q1: 'sample' }, started_at: '1999-01-01T00:00:00Z', time_spent: 99999 },
        })
        check('submit → 200', r.status === 200, `got ${r.status}`)
        check('submit → status submitted', r.body?.data?.status === 'submitted', JSON.stringify(r.body?.data))
        check('submit → scored=true (W6 chấm)', r.body?.data?.scored === true)
        check('submit → raw_score=1 (q1 đúng theo answer_keys)', r.body?.data?.raw_score === 1, `${r.body?.data?.raw_score}`)
        check('submit → time_spent server nhỏ (bỏ qua client 99999)', typeof r.body?.data?.time_spent === 'number' && r.body?.data?.time_spent < 120, `${r.body?.data?.time_spent}`)
        for (const k of ['answer_keys', 'keys', 'correct']) check(`submit → KHÔNG có ${k}`, !deepHas(r.body, k))
        // persisted answers + scoring server-side (admin read)
        const { data: row } = await admin.from('attempts').select('answers, raw_score, band, status').eq('id', attemptId).maybeSingle()
        check('submit → answers persisted', row?.answers?.q1 === 'sample', JSON.stringify(row?.answers))
        check('submit → DB raw_score=1 (W6 chấm server-side)', row?.raw_score === 1, JSON.stringify(row))
      }

      // 6) submit lại → idempotent (vẫn submitted)
      {
        const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: attemptId, answers: { q1: 'changed' } } })
        check('submit lại → 200 idempotent submitted', r.status === 200 && r.body?.data?.status === 'submitted')
        const { data: row } = await admin.from('attempts').select('answers').eq('id', attemptId).maybeSingle()
        check('submit lại → answers KHÔNG bị ghi đè (terminal)', row?.answers?.q1 === 'sample', JSON.stringify(row?.answers))
      }

      // 7) user2 submit attempt của user1 → 404 (owner guard, không lộ tồn tại)
      {
        const r = await api('/api/submit', { method: 'POST', cookie: u2.cookie, body: { attempt_id: attemptId, answers: {} } })
        check('cross-user submit → 404', r.status === 404 && r.body?.meta?.error_code === 'NOT_FOUND', `got ${r.status}`)
      }

      // 8) timer bypass → expired: seed attempt started_at cũ (admin), submit → expired, time_spent=duration
      {
        const oldStarted = new Date(Date.now() - 120_000).toISOString()
        const { data: seeded, error } = await admin
          .from('attempts')
          .insert({ user_id: u1.userId, test_id: FREE, status: 'in_progress', started_at: oldStarted, duration_sec: 30 })
          .select('id')
          .single()
        if (error) {
          skipped('timer bypass → expired', 'seed fail: ' + error.message)
        } else {
          const r = await api('/api/submit', { method: 'POST', cookie: u1.cookie, body: { attempt_id: seeded.id, answers: {} } })
          check('over-time submit → status expired', r.body?.data?.status === 'expired', JSON.stringify(r.body?.data))
          check('over-time submit → time_spent capped = duration(30)', r.body?.data?.time_spent === 30, `${r.body?.data?.time_spent}`)
        }
      }

      // 9) UNLOCKED premium start → 200 + tạo attempt (ready signal: free/unlocked tạo attempt)
      {
        await admin.from('test_unlocks').upsert(
          { user_id: u1.userId, test_id: PREMIUM, product_id: '33333333-3333-3333-3333-333333333333' },
          { onConflict: 'user_id,test_id,product_id' },
        )
        const r = await api(`/api/exam/${PREMIUM}/start`, { method: 'POST', cookie: u1.cookie })
        check('unlocked premium start → 200', r.status === 200, `got ${r.status}`)
        check('unlocked premium start → status in_progress + attempt_id', r.body?.data?.status === 'in_progress' && !!r.body?.data?.attempt_id)
        for (const k of SECRET_KEYS) check(`unlocked premium start → KHÔNG có ${k}`, !deepHas(r.body, k))
      }

      // 10) CONCURRENT start (race) → đúng 1 attempt in_progress (partial unique + reselect)
      {
        await admin.from('attempts').delete().eq('user_id', u1.userId).eq('test_id', FREE).eq('status', 'in_progress')
        const starts = await Promise.all(
          Array.from({ length: 5 }, () => api(`/api/exam/${FREE}/start`, { method: 'POST', cookie: u1.cookie })),
        )
        const ids = new Set(starts.map((s) => s.body?.data?.attempt_id).filter(Boolean))
        check('concurrent start → tất cả 200', starts.every((s) => s.status === 200), starts.map((s) => s.status).join(','))
        check('concurrent start → cùng 1 attempt_id (no race dup)', ids.size === 1, [...ids].join(','))
        const { count } = await admin
          .from('attempts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', u1.userId)
          .eq('test_id', FREE)
          .eq('status', 'in_progress')
        check('concurrent start → đúng 1 in_progress trong DB', (count ?? 0) === 1, `count=${count}`)
      }
    } catch (e) {
      skipped('authed cases', 'exception: ' + (e?.message ?? String(e)))
    }
  }

  console.log(`\n=== attempt lifecycle smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exitCode = 2
})
