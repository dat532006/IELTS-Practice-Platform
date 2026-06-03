// W8 FE smoke (server-verifiable) — Result UI + annotation foundation.
// Server gate: guest /result/[id] → redirect /login?next; authed → 200 + ResultView mount, KHÔNG lộ answer_keys.
// Payload FE tiêu thụ (GET /api/result/[id]): review sanitized + KHÔNG answer_keys/keys/points/match.
// Annotation: highlight (strict anchor) persist; question bookmark persist; test bookmark toggle.
// ⚠️ Interactive (tạo highlight selection, restore reload, popup, bookmark icon) cần BROWSER — ghi blocker ở report.
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/result_highlight_ui_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const TEST_MULTI = '66666666-6666-6666-6666-666666666666'
const SECRET = ['answer_keys', 'keys', 'points', 'match']
const ALL_CORRECT = { q1: 'forests', q2: '2 degrees', q3: 'B', q4: ['A', 'C'], q5: 'FALSE', q6: 'YES', q7: 'ii', q8: 'B', q9: '1879', q10: 'C' }

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
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: 'manual',
  })
  let body = null
  try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body, location: r.headers.get('location') || '' }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return finish(skipAll('thiếu env Supabase'))

  let cookie, attemptId
  try {
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    await admin.auth.admin.createUser({ email: 'w8-fe@test.dev', password: 'w8-fe-123', email_confirm: true }).catch(() => {})
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await c.auth.signInWithPassword({ email: 'w8-fe@test.dev', password: 'w8-fe-123' })
    if (error || !data?.session) return finish(skipAll('signIn fail: ' + (error?.message ?? 'no session')))
    cookie = ssrCookie(url, data.session)
    // tạo submitted attempt
    const st = await api('POST', `/api/exam/${TEST_MULTI}/start`, cookie, {})
    if (st.status !== 200 || !st.body?.data?.attempt_id) return finish(skipAll(`start=${st.status} (cookie/guard?)`))
    attemptId = st.body.data.attempt_id
    await api('POST', '/api/submit', cookie, { attempt_id: attemptId, answers: ALL_CORRECT })
  } catch (e) { return finish(skipAll(e.message)) }

  // 1) guest /result/[id] → redirect /login?next
  {
    const r = await api('GET', `/result/${attemptId}`)
    check('guest /result → redirect 3xx', r.status >= 300 && r.status < 400, `status ${r.status}`)
    check('guest /result → /login?next', r.location.includes('/login') && r.location.includes('next'), r.location)
  }

  // 2) authed /result/[id] → 200 + ResultView mount, HTML không lộ answer_keys
  {
    const r = await fetch(`${BASE}/result/${attemptId}`, { headers: { Cookie: cookie } })
    const html = await r.text()
    check('authed /result → 200', r.status === 200, `status ${r.status}`)
    for (const k of ['answer_keys', 'Climate Change and Urban']) check(`authed /result HTML → KHÔNG lộ "${k}"`, !html.includes(k))
  }

  // 3) Payload FE tiêu thụ: review sanitized + KHÔNG forbidden keys
  {
    const r = await api('GET', `/api/result/${attemptId}`, cookie)
    check('GET /api/result → 200', r.status === 200, `status ${r.status}`)
    check('result → review 10 câu', Array.isArray(r.body?.data?.review) && r.body.data.review.length === 10)
    check('result → band/raw có mặt', r.body?.data?.raw_score === 10)
    for (const k of SECRET) check(`result → KHÔNG có "${k}"`, !deepHas(r.body, k))
  }

  // 4) Highlight strict anchor persist (FE gửi đúng field whitelist) + question bookmark
  {
    const hl = [{ id: 'hl_1', startPath: '0/1/0', startOffset: 0, endPath: '0/1/0', endOffset: 6, quote: 'Cities', color: 'y', note: 'ghi chú' }]
    const a = await api('POST', `/api/attempts/${attemptId}/annotations`, cookie, { highlights: hl, bookmarked_qs: ['q1', 'q3'] })
    check('annotation persist → 200', a.status === 200, `status ${a.status}`)
    check('annotation echo highlights', (a.body?.data?.highlights ?? []).length === 1)
    check('annotation echo bookmarked_qs', JSON.stringify((a.body?.data?.bookmarked_qs ?? []).sort()) === JSON.stringify(['q1', 'q3']))
    // reload restore: start lại (terminal → AttemptDTO không trả; dùng GET result để xác nhận persist)
    const res = await api('GET', `/api/result/${attemptId}`, cookie)
    check('reload → highlights restore (qua result)', (res.body?.data?.highlights ?? []).length === 1)
    check('reload → bookmarked_qs restore', (res.body?.data?.bookmarked_qs ?? []).includes('q1'))
  }

  // 5) Test bookmark toggle (idempotent)
  {
    await api('POST', '/api/bookmarks', cookie, { test_id: TEST_MULTI, bookmarked: true })
    const b2 = await api('POST', '/api/bookmarks', cookie, { test_id: TEST_MULTI, bookmarked: true })
    check('test bookmark toggle → 200 idempotent', b2.status === 200)
    await api('POST', '/api/bookmarks', cookie, { test_id: TEST_MULTI, bookmarked: false })
  }

  finish()
}

function finish() {
  console.log(`\n=== Result + highlight UI smoke @ ${BASE} ===`)
  console.log(out.join('\n'))
  console.log('  (tạo highlight selection / restore reload / popup / bookmark icon = browser smoke — xem blocker ở W8 FE report)')
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
