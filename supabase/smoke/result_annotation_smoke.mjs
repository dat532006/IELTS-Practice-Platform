// W8 runtime smoke — Result API guard + annotation persistence.
// Contract: docs/ContractForAI/BackendEngineer/phase2/W8/w8_result_annotation_contract.md §7
// Drives REAL API. Prereq: Supabase local + seed (test 66666666 free 10q + answer_keys; 11111111 free) + next start.
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/result_annotation_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const TEST_MULTI = '66666666-6666-6666-6666-666666666666' // free reading, 10 câu + answer_keys
const TEST_FREE1 = '11111111-1111-1111-1111-111111111111' // free reading, 1 câu (cho ca in_progress)
const SECRET_KEYS = ['answer_keys', 'keys', 'points', 'match'] // KHÔNG được xuất hiện trong result
// 8 đúng + 2 sai (theo seed answer_keys 66666666) → raw_score=8.
const MIX_ANSWERS = { q1: 'forests', q2: '2 degrees', q3: 'B', q4: ['A', 'C'], q5: 'FALSE', q6: 'YES', q7: 'ii', q8: 'B', q9: 'wrong', q10: 'A' }

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
  await admin.auth.admin.createUser({ email, password: 'w8-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w8-pass-123' })
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
    A = await signIn(url, anon, service, 'w8-a@test.dev')
    B = await signIn(url, anon, service, 'w8-b@test.dev')
  } catch (e) { return finish(skipAll(e.message)) }

  // sanity: cookie nhận session? (start free test phải 200)
  const startMulti = await api('POST', `/api/exam/${TEST_MULTI}/start`, A.cookie, {})
  if (startMulti.status !== 200 || !startMulti.body?.data?.attempt_id) {
    return finish(skipAll(`guard không nhận cookie (start=${startMulti.status}) — xem db:verify`))
  }
  const attemptMulti = startMulti.body.data.attempt_id

  // === 1) Own SUBMITTED → 200 review (đúng/sai khớp), KHÔNG raw answer_keys ===
  {
    const sub = await api('POST', '/api/submit', A.cookie, { attempt_id: attemptMulti, answers: MIX_ANSWERS })
    check('submit → 200', sub.status === 200, `got ${sub.status}`)
    check('submit → raw_score=8', sub.body?.data?.raw_score === 8, `raw=${sub.body?.data?.raw_score}`)

    const res = await api('GET', `/api/result/${attemptMulti}`, A.cookie)
    check('own submitted result → 200', res.status === 200, `got ${res.status}`)
    const d = res.body?.data
    check('result → status submitted', d?.status === 'submitted')
    check('result → raw_score=8 (đã lưu, không chấm lại)', d?.raw_score === 8)
    check('result → max_score=10', d?.max_score === 10, `max=${d?.max_score}`)
    check('result → review là array 10 câu', Array.isArray(d?.review) && d.review.length === 10, `len=${d?.review?.length}`)
    const q1 = (d?.review ?? []).find((r) => r.question_id === 'q1')
    const q9 = (d?.review ?? []).find((r) => r.question_id === 'q9')
    check('result → q1 is_correct=true', q1?.is_correct === true)
    check('result → q1 có correct_answers', Array.isArray(q1?.correct_answers) && q1.correct_answers.length > 0)
    check('result → q1 user_answer=forests', q1?.user_answer === 'forests')
    check('result → q9 is_correct=false (đáp sai)', q9?.is_correct === false)
    for (const k of SECRET_KEYS) check(`result → KHÔNG có "${k}"`, !deepHas(res.body, k))
    // review item KHÔNG được có field points/match (chỉ correct_answers)
    check('result → review item KHÔNG có points/match', !(d?.review ?? []).some((r) => 'points' in r || 'match' in r))
  }

  // === 2) Own IN_PROGRESS → 403 RESULT_NOT_READY, KHÔNG review/đáp án ===
  {
    const st = await api('POST', `/api/exam/${TEST_FREE1}/start`, A.cookie, {})
    const inProg = st.body?.data?.attempt_id
    const res = await api('GET', `/api/result/${inProg}`, A.cookie)
    check('own in_progress result → 403', res.status === 403, `got ${res.status}`)
    check('own in_progress → error_code=RESULT_NOT_READY', res.body?.meta?.error_code === 'RESULT_NOT_READY', JSON.stringify(res.body?.meta))
    check('own in_progress → data=null (no review)', res.body?.data === null)
    for (const k of SECRET_KEYS) check(`in_progress → KHÔNG có "${k}"`, !deepHas(res.body, k))
  }

  // === 3) Cross-user result → 404 (không lộ tồn tại) ===
  {
    const res = await api('GET', `/api/result/${attemptMulti}`, B.cookie)
    check('cross-user result → 404', res.status === 404, `got ${res.status}`)
    check('cross-user → error_code=NOT_FOUND', res.body?.meta?.error_code === 'NOT_FOUND')
    for (const k of SECRET_KEYS) check(`cross-user → KHÔNG có "${k}"`, !deepHas(res.body, k))
  }

  // === 4) Annotation persistence (own) + cross-user deny ===
  {
    const hi = [{ startPath: '1/0', startOffset: 0, endPath: '1/0', endOffset: 5, quote: 'Cities' }]
    const ann = await api('POST', `/api/attempts/${attemptMulti}/annotations`, A.cookie, { highlights: hi, bookmarked_qs: ['q1', 'q3', 'q1'] })
    check('annotation own → 200', ann.status === 200, `got ${ann.status}`)
    check('annotation → bookmarked_qs dedupe (q1,q3)', JSON.stringify((ann.body?.data?.bookmarked_qs ?? []).sort()) === JSON.stringify(['q1', 'q3']))

    const res = await api('GET', `/api/result/${attemptMulti}`, A.cookie)
    check('result echo highlights (persist)', Array.isArray(res.body?.data?.highlights) && res.body.data.highlights.length === 1)
    check('result echo bookmarked_qs', (res.body?.data?.bookmarked_qs ?? []).includes('q1'))

    // cross-user annotation → 404
    const bad = await api('POST', `/api/attempts/${attemptMulti}/annotations`, B.cookie, { bookmarked_qs: ['hack'] })
    check('annotation cross-user → 404', bad.status === 404, `got ${bad.status}`)

    // 🔒 P1: malicious highlight nhồi forbidden key → 400 (strict anchor reject)
    const mal = await api('POST', `/api/attempts/${attemptMulti}/annotations`, A.cookie, {
      highlights: [{ answer_keys: 'leak', points: 1, match: 'exact', startPath: '1/0', startOffset: 0, endPath: '1/0', endOffset: 5 }],
    })
    check('annotation malicious key → 400 (strict reject)', mal.status === 400, `got ${mal.status}`)
    // dù cố nhồi, result KHÔNG chứa forbidden key (strict input + sanitize output)
    const resAfter = await api('GET', `/api/result/${attemptMulti}`, A.cookie)
    for (const k of SECRET_KEYS) check(`result sau malicious annotation → KHÔNG có "${k}"`, !deepHas(resAfter.body, k))
    check('result highlights vẫn là anchor hợp lệ (không bị nhiễm)', (resAfter.body?.data?.highlights ?? []).every((h) => 'startPath' in h && !('answer_keys' in h)))

    // oversize quote (valid key) → 400
    const big = await api('POST', `/api/attempts/${attemptMulti}/annotations`, A.cookie, {
      highlights: [{ startPath: '1/0', startOffset: 0, endPath: '1/0', endOffset: 5, quote: 'x'.repeat(40000) }],
    })
    check('annotation oversize quote → 400', big.status === 400, `got ${big.status}`)
  }

  // === 5) Bookmark toggle idempotent ===
  {
    await api('POST', '/api/bookmarks', A.cookie, { test_id: TEST_MULTI, bookmarked: true })
    await api('POST', '/api/bookmarks', A.cookie, { test_id: TEST_MULTI, bookmarked: true }) // lần 2
    const { count } = await A.admin.from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', A.session.user.id).eq('test_id', TEST_MULTI)
    check('bookmark toggle 2x → 1 row (idempotent)', count === 1, `count=${count}`)
    await api('POST', '/api/bookmarks', A.cookie, { test_id: TEST_MULTI, bookmarked: false })
    const { count: c2 } = await A.admin.from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', A.session.user.id).eq('test_id', TEST_MULTI)
    check('bookmark off → 0 row', c2 === 0, `count=${c2}`)
  }

  // === 6) Direct client write attempts (annotation cols) → deny (RLS) ===
  {
    const authedDb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${A.session.access_token}` } } })
    const wr = await authedDb.from('attempts').update({ bookmarked_qs: ['x'] }).eq('id', attemptMulti)
    check('direct client UPDATE attempts → denied', !!wr.error || wr.count === 0, wr.error ? '' : 'KHÔNG bị chặn (LEAK)')
  }

  finish()
}

function finish() {
  console.log(`\n=== Result + annotation smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
