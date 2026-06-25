// W10 runtime smoke — Writing AI grading route (MOCK mode; no ANTHROPIC_API_KEY needed).
// Contract: docs/ContractForAI/BackendEngineer/phase2/W10/w10_writing_grading_contract.md §6
// Drives REAL API. Prereq: Supabase local (migration reserve_ai_grade applied) + seed (writing 99999999) + next start.
//   Grader runs in MOCK (deterministic) because .env.local has no ANTHROPIC_API_KEY → asserts overall server-computed.
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/writing_grading_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const WRITING = '99999999-9999-9999-9999-999999999999'
const SECRET = ['ANTHROPIC_API_KEY', 'sk-ant', 'api_key', 'apiKey'] // KHÔNG được lộ
const roundHalf = (x) => Math.round(x * 2) / 2
const overallExpect = (t1, t2) => roundHalf(t1 * (1 / 3) + t2 * (2 / 3))
const words = (n) => Array.from({ length: n }, (_, i) => `word${i % 50}`).join(' ')

let pass = 0, fail = 0, skip = 0
const out = []
const check = (n, c, e) => (c ? (pass++, out.push(`  ✅ ${n}`)) : (fail++, out.push(`  ❌ ${n}${e ? ' — ' + e : ''}`)))
const skipAll = (w) => { skip++; out.push(`  ⏭️  SKIP — ${w}`) }
const deepHas = (o, k) => {
  if (o == null || typeof o !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(o, k)) return true
  for (const v of Object.values(o)) if (deepHas(v, k)) return true
  return false
}
const jsonHas = (o, sub) => JSON.stringify(o ?? '').toLowerCase().includes(sub.toLowerCase())

async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let body = null
  try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body }
}
function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch { /* optional */ }
}
function ssrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'w10-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w10-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { admin, session: data.session, cookie: ssrCookie(url, data.session), anon }
}
async function startAttempt(cookie) {
  const r = await api('POST', `/api/exam/${WRITING}/start`, cookie, {})
  return r.body?.data?.attempt_id
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return finish(skipAll('thiếu env Supabase'))

  let A, B
  try {
    A = await signIn(url, anon, service, 'w10-a@test.dev')
    B = await signIn(url, anon, service, 'w10-b@test.dev')
  } catch (e) { return finish(skipAll(e.message)) }

  // Clean today's quota + old attempts để deterministic.
  for (const U of [A, B]) {
    await U.admin.from('ai_grade_usage').delete().eq('user_id', U.session.user.id).eq('used_on', new Date().toISOString().slice(0, 10))
    await U.admin.from('attempts').delete().eq('test_id', WRITING).eq('user_id', U.session.user.id)
  }

  // === 0) Unauth → 401 ===
  {
    const r = await api('POST', '/api/grade-writing', null, { attempt_id: WRITING, task1_text: words(160), task2_text: words(260) })
    check('unauth grade → 401', r.status === 401, `got ${r.status}`)
  }

  const attemptA = await startAttempt(A.cookie)
  if (!attemptA) return finish(skipAll('không start được writing attempt (db reset/seed?)'))

  // === 1) Word count too low → 400 ===
  {
    const r = await api('POST', '/api/grade-writing', A.cookie, { attempt_id: attemptA, task1_text: words(10), task2_text: words(10) })
    check('word count thấp → 400', r.status === 400, `got ${r.status}`)
    check('error_code WORD_COUNT_TOO_LOW', r.body?.meta?.error_code === 'WORD_COUNT_TOO_LOW', JSON.stringify(r.body?.meta))
  }

  // === 2) Happy path (mock) → 200, overall server-computed, no secret ===
  {
    const r = await api('POST', '/api/grade-writing', A.cookie, { attempt_id: attemptA, task1_text: words(160), task2_text: words(260) })
    check('happy grade → 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.body?.meta)}`)
    const d = r.body?.data
    check('mock:true (no API key)', d?.mock === true)
    check('warning AI_GRADER_MOCK', (r.body?.meta?.warnings ?? []).includes('AI_GRADER_MOCK'))
    const t1 = d?.task1?.band, t2 = d?.task2?.band
    check('task1/task2 band hợp lệ (0..9 step .5)', [t1, t2].every((b) => typeof b === 'number' && b >= 0 && b <= 9 && Number.isInteger(b * 2)), `t1=${t1} t2=${t2}`)
    check('overall_band = server compute (T1×1/3+T2×2/3 round .5)', d?.overall_band === overallExpect(t1, t2), `got ${d?.overall_band}, expect ${overallExpect(t1, t2)}`)
    check('có criteria 4 tiêu chí', d?.task1?.criteria && 'task_response' in d.task1.criteria && 'grammar' in d.task1.criteria)
    check('word count server đếm (task1_wc≈160)', d?.task1_wc === 160 && d?.task2_wc === 260, `${d?.task1_wc}/${d?.task2_wc}`)
    for (const k of SECRET) check(`response KHÔNG lộ "${k}"`, !deepHas(r.body, k) && !jsonHas(r.body, k))
    check('response KHÔNG chứa system prompt ("IELTS Writing examiner")', !jsonHas(r.body, 'examiner. Grade Task'))
    // DB: writing_submissions lưu ai_score + overall
    const { data: ws } = await A.admin.from('writing_submissions').select('ai_score, task1_wc').eq('attempt_id', attemptA).maybeSingle()
    check('writing_submissions persisted (ai_score.overall_band)', ws?.ai_score?.overall_band === d?.overall_band)
  }

  // === 3) Free 2nd grade same day → 429 (rate limit, không gọi Claude) ===
  {
    const r = await api('POST', '/api/grade-writing', A.cookie, { attempt_id: attemptA, task1_text: words(160), task2_text: words(260) })
    check('free 2nd/day → 429', r.status === 429, `got ${r.status}`)
    check('error_code RATE_LIMITED', r.body?.meta?.error_code === 'RATE_LIMITED', JSON.stringify(r.body?.meta))
  }

  // === 4) Pro bypass: B plan=pro → chấm nhiều lần OK ===
  {
    await B.admin.from('profiles').update({ plan: 'pro' }).eq('id', B.session.user.id)
    const attemptB = await startAttempt(B.cookie)
    const r1 = await api('POST', '/api/grade-writing', B.cookie, { attempt_id: attemptB, task1_text: words(160), task2_text: words(260) })
    const r2 = await api('POST', '/api/grade-writing', B.cookie, { attempt_id: attemptB, task1_text: words(170), task2_text: words(270) })
    check('Pro grade #1 → 200', r1.status === 200, `got ${r1.status}`)
    check('Pro grade #2 (same day) → 200 (bypass rate limit)', r2.status === 200, `got ${r2.status}`)
  }

  // === 5) Cross-user attempt → 404 ===
  {
    const r = await api('POST', '/api/grade-writing', B.cookie, { attempt_id: attemptA, task1_text: words(160), task2_text: words(260) })
    check('cross-user attempt → 404', r.status === 404, `got ${r.status}`)
  }

  // === 6) Direct client write/rpc → deny ===
  {
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${A.session.access_token}` } } })
    const wr = await db.from('writing_submissions').update({ ai_score: { hacked: true } }).eq('attempt_id', attemptA)
    check('direct client UPDATE writing_submissions → denied', !!wr.error || wr.count === 0, wr.error ? '' : 'LEAK')
    const rpc = await db.rpc('reserve_ai_grade', { p_user_id: A.session.user.id })
    check('direct client RPC reserve_ai_grade → denied', !!rpc.error, 'client gọi được RPC (LEAK)')
  }

  // === 7) Writing result review (F-B): owner 200 / cross-user 404 / unauth 401 ===
  {
    const own = await api('GET', `/api/writing-result/${attemptA}`, A.cookie)
    check('writing-result owner → 200', own.status === 200, `got ${own.status}`)
    check('writing-result overall_band khớp (server)', typeof own.body?.data?.overall_band === 'number', JSON.stringify(own.body?.data?.overall_band))
    check('writing-result có task1/task2', !!own.body?.data?.task1?.band && !!own.body?.data?.task2?.band)
    for (const k of SECRET) check(`writing-result KHÔNG lộ "${k}"`, !deepHas(own.body, k) && !jsonHas(own.body, k))
    const cross = await api('GET', `/api/writing-result/${attemptA}`, B.cookie)
    check('writing-result cross-user → 404', cross.status === 404, `got ${cross.status}`)
    const guest = await api('GET', `/api/writing-result/${attemptA}`, null)
    check('writing-result unauth → 401', guest.status === 401, `got ${guest.status}`)
  }

  // === 8) Test-type guard (F-C): reading attempt → grade-writing 404, KHÔNG finalize, KHÔNG tạo submission ===
  {
    const READING = '66666666-6666-6666-6666-666666666666'
    const sr = await api('POST', `/api/exam/${READING}/start`, A.cookie, {})
    const ra = sr.body?.data?.attempt_id
    if (!ra) { check('reading attempt start (fixture 66666666)', false, 'không start được'); }
    else {
      const r = await api('POST', '/api/grade-writing', A.cookie, { attempt_id: ra, task1_text: words(160), task2_text: words(260) })
      check('reading attempt → grade-writing 404 (type guard)', r.status === 404, `got ${r.status}`)
      const { data: att } = await A.admin.from('attempts').select('status').eq('id', ra).maybeSingle()
      check('reading attempt KHÔNG bị finalize (vẫn in_progress)', att?.status === 'in_progress', `status=${att?.status}`)
      const { count } = await A.admin.from('writing_submissions').select('id', { count: 'exact', head: true }).eq('attempt_id', ra)
      check('reading attempt KHÔNG tạo writing_submissions', count === 0, `count=${count}`)
    }
  }

  finish()
}

function finish() {
  console.log(`\n=== Writing grading smoke @ ${BASE} (MOCK mode) ===`)
  console.log(out.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
