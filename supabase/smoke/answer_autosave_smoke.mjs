// W9 runtime smoke — Answer autosave (draft) route + restore + terminal/cross-user guards.
// Closes Gate-Review finding P1-03 (route POST /api/attempts/[id]/answers had zero runtime coverage).
// Contract: docs/ContractForAI/FrontendEngineer/phase2/W9/w9_exam_ui_reference_parity_contract.md §2/§7 (Task A)
// Drives REAL API. Prereq: Supabase local + seed (test 66666666 free 10q + answer_keys) + next start.
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/answer_autosave_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const TEST_MULTI = '66666666-6666-6666-6666-666666666666' // free reading, 10 câu + answer_keys
const SECRET_KEYS = ['answer_keys', 'keys', 'points', 'match'] // KHÔNG được xuất hiện ở bất kỳ response nào
const DRAFT = { q1: 'forests', q3: 'B', q4: ['A', 'C'] } // answer THÔ owner (không phải đáp án đúng)

let pass = 0, fail = 0, skip = 0
const results = []
const ok = (n) => { pass++; results.push(`  ✅ ${n}`) }
const no = (n, e) => { fail++; results.push(`  ❌ ${n}${e ? ' — ' + e : ''}`) }
const check = (n, c, e) => (c ? ok(n) : no(n, e))
const skipAll = (why) => { skip++; results.push(`  ⏭️  SKIP — ${why}`) }

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
const deepHas = (o, k) => {
  if (o == null || typeof o !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(o, k)) return true
  for (const v of Object.values(o)) if (deepHas(v, k)) return true
  return false
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
  const MAX = 3180
  const parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'w9-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w9-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { admin, session: data.session, cookie: ssrCookie(url, data.session), anon }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return finish(skipAll('thiếu env Supabase'))

  let A, B
  try {
    A = await signIn(url, anon, service, 'w9-a@test.dev')
    B = await signIn(url, anon, service, 'w9-b@test.dev')
  } catch (e) { return finish(skipAll(e.message)) }

  // Clean state: bỏ attempt cũ của A/B trên test này để case terminal không bị reuse attempt cũ.
  await A.admin.from('attempts').delete().eq('test_id', TEST_MULTI).in('user_id', [A.session.user.id, B.session.user.id])

  // sanity: start free test phải 200 (cookie nhận session).
  const start = await api('POST', `/api/exam/${TEST_MULTI}/start`, A.cookie, {})
  if (start.status !== 200 || !start.body?.data?.attempt_id) {
    return finish(skipAll(`guard không nhận cookie (start=${start.status}) — xem db:verify`))
  }
  const attemptId = start.body.data.attempt_id

  // === 1) Autosave own in_progress → 200 saved ===
  {
    const r = await api('POST', `/api/attempts/${attemptId}/answers`, A.cookie, { answers: DRAFT })
    check('autosave own in_progress → 200', r.status === 200, `got ${r.status}`)
    check('autosave → saved:true', r.body?.data?.saved === true)
    for (const k of SECRET_KEYS) check(`autosave resp → KHÔNG có "${k}"`, !deepHas(r.body, k))
  }

  // === 2) Restore qua start DTO (idempotent reuse) → answers seed lại đúng (chống mất bài reload) ===
  {
    const re = await api('POST', `/api/exam/${TEST_MULTI}/start`, A.cookie, {})
    check('re-start idempotent → cùng attempt', re.body?.data?.attempt_id === attemptId, `got ${re.body?.data?.attempt_id}`)
    const ans = re.body?.data?.answers
    check('start DTO echo draft answers (restore)', !!ans && ans.q1 === 'forests' && ans.q3 === 'B', JSON.stringify(ans))
    check('start DTO restore mảng (mcq_multi)', Array.isArray(ans?.q4) && ans.q4.join(',') === 'A,C', JSON.stringify(ans?.q4))
    for (const k of SECRET_KEYS) check(`start DTO → KHÔNG có "${k}"`, !deepHas(re.body, k))
  }

  // === 3) Cross-user autosave → 404 (không lộ tồn tại + không ghi đè) ===
  {
    const r = await api('POST', `/api/attempts/${attemptId}/answers`, B.cookie, { answers: { q1: 'HACK' } })
    check('cross-user autosave → 404', r.status === 404, `got ${r.status}`)
    // DB không bị thay đổi bởi B
    const { data } = await A.admin.from('attempts').select('answers').eq('id', attemptId).maybeSingle()
    check('cross-user KHÔNG ghi đè (q1 vẫn forests)', data?.answers?.q1 === 'forests', JSON.stringify(data?.answers))
  }

  // === 4) Oversize answers → 400 (size guard 64KB) ===
  {
    const big = { q1: 'x'.repeat(70 * 1024) }
    const r = await api('POST', `/api/attempts/${attemptId}/answers`, A.cookie, { answers: big })
    check('oversize answers → 400', r.status === 400, `got ${r.status}`)
  }

  // === 5) Shape sai (value object/number) → 400 (strict AnswersSchema) ===
  {
    const r = await api('POST', `/api/attempts/${attemptId}/answers`, A.cookie, { answers: { q1: { nested: 1 } } })
    check('invalid value shape → 400', r.status === 400, `got ${r.status}`)
  }

  // === 6) Terminal guard: submit → autosave sau đó → 409 ATTEMPT_TERMINAL (không ghi đè/không hồi sinh) ===
  {
    const sub = await api('POST', '/api/submit', A.cookie, { attempt_id: attemptId, answers: { q1: 'forests', q2: '2 degrees' } })
    check('submit → 200 (terminal)', sub.status === 200, `got ${sub.status}`)
    const r = await api('POST', `/api/attempts/${attemptId}/answers`, A.cookie, { answers: { q1: 'AFTER-SUBMIT' } })
    check('autosave sau submit → 409 ATTEMPT_TERMINAL', r.status === 409, `got ${r.status}`)
    check('autosave sau submit → error_code=ATTEMPT_TERMINAL', r.body?.meta?.error_code === 'ATTEMPT_TERMINAL', JSON.stringify(r.body?.meta))
    // DB: answers = đáp án lúc submit, KHÔNG bị "AFTER-SUBMIT" ghi đè
    const { data } = await A.admin.from('attempts').select('answers, status').eq('id', attemptId).maybeSingle()
    check('terminal attempt giữ answers lúc submit (không bị autosave ghi đè)', data?.answers?.q1 === 'forests', JSON.stringify(data?.answers))
    check('terminal attempt status submitted', data?.status === 'submitted', data?.status)
  }

  // === 7) Direct client UPDATE attempts.answers → deny (RLS write-deny) ===
  {
    const authedDb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${A.session.access_token}` } } })
    const wr = await authedDb.from('attempts').update({ answers: { q1: 'rls-bypass' } }).eq('id', attemptId)
    check('direct client UPDATE attempts.answers → denied', !!wr.error || wr.count === 0, wr.error ? '' : 'KHÔNG bị chặn (LEAK)')
  }

  finish()
}

function finish() {
  console.log(`\n=== Answer autosave smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
