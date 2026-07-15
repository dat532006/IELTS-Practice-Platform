// Writing grading concurrency smoke (EXAM-002) — N request chấm ĐỒNG THỜI trên 1 attempt → đúng
// 1 winner (200), phần còn lại 409 (GRADING_CONFLICT); đúng 1 writing_submissions row; provider/quota
// tiêu đúng 1 lần; result 200 (KHÔNG 500). Prereq: Supabase local + next dev (:3100, mock grader).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/writing_concurrency_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }
const words = (n) => Array.from({ length: n }, (_, i) => `word${i % 50}`).join(' ')

function loadEnvLocal() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
function ssrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`, value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function api(method, path, cookie, body) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const runId = Date.now().toString(36)
  const email = `writing-conc-${runId}@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'conc-pass-123', email_confirm: true })
  const userId = made.data.user.id
  // PRO user: bỏ qua free-daily-limit → KHÔNG có rate-limit vô tình serialize; chỉ idempotency claim
  //   mới ngăn duplicate provider call/row. Đây là điều kiện cô lập đúng EXAM-002.
  await root.from('profiles').update({ plan: 'pro' }).eq('id', userId)
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'conc-pass-123' })
  const cookie = ssrCookie(url, signed.data.session)
  let testId
  try {
    const t = await root.from('tests').insert({
      slug: `writing-conc-${runId}`, title: 'Writing Concurrency', type: 'writing', is_free: true, status: 'published',
      passages: [{ id: 'task1', number: 1, content: 'Task 1 prompt' }, { id: 'task2', number: 2, content: 'Task 2 prompt' }],
      questions: [],
    }).select('id').single()
    if (t.error) throw t.error
    testId = t.data.id

    const start = await api('POST', `/api/exam/${testId}/start`, cookie, {})
    const attemptId = start.body?.data?.attempt_id
    check('start writing attempt → có attempt_id', Boolean(attemptId), JSON.stringify(start.body))

    // N request chấm ĐỒNG THỜI trên cùng attempt.
    const N = 10
    const payload = { attempt_id: attemptId, task1_text: words(160), task2_text: words(260) }
    const results = await Promise.all(Array.from({ length: N }, () => api('POST', '/api/grade-writing', cookie, payload)))
    const ok200 = results.filter((r) => r.status === 200).length
    const conflict409 = results.filter((r) => r.status === 409).length
    check(`đúng 1 winner (200): ${ok200}`, ok200 === 1, `statuses=${results.map((r) => r.status).join(',')}`)
    check(`phần còn lại 409 conflict: ${conflict409}`, conflict409 === N - 1, `statuses=${results.map((r) => r.status).join(',')}`)

    // Đúng 1 writing_submissions row (không duplicate).
    const rows = await root.from('writing_submissions').select('id, ai_score', { count: 'exact' }).eq('attempt_id', attemptId)
    check('đúng 1 writing_submissions row', (rows.data ?? []).length === 1, `count=${(rows.data ?? []).length}`)
    check('row có ai_score (đã chấm, không placeholder null)', (rows.data ?? [])[0]?.ai_score?.overall_band != null, JSON.stringify((rows.data ?? [])[0]?.ai_score ?? null))

    // Attempt finalize đúng 1 lần.
    const att = await root.from('attempts').select('status, band').eq('id', attemptId).single()
    check('attempt → submitted + band', att.data?.status === 'submitted' && att.data?.band != null, JSON.stringify(att.data))

    // (Provider gọi đúng 1 lần được chứng minh bởi: 1 winner 200 + 9 conflict 409 + đúng 1 row có ai_score —
    //  loser 409 trả về TỪ claim, TRƯỚC reserve/gọi provider.)

    // Result đọc được (KHÔNG 500 do >1 row).
    const res = await api('GET', `/api/writing-result/${attemptId}`, cookie)
    check('GET writing-result → 200 (không 500)', res.status === 200 && res.body?.data?.overall_band != null, `status=${res.status}`)
  } finally {
    // Race the AI finalizer against the generic submit path on a fresh attempt.
    const startRace = await api('POST', `/api/exam/${testId}/start`, cookie, {})
    const raceAttemptId = startRace.body?.data?.attempt_id
    const racePayload = { attempt_id: raceAttemptId, task1_text: words(160), task2_text: words(260) }
    const [gradeRace, submitRace] = await Promise.all([
      api('POST', '/api/grade-writing', cookie, racePayload),
      api('POST', '/api/submit', cookie, { attempt_id: raceAttemptId, answers: {}, expected_rev: 0 }),
    ])
    check('grade-vs-submit race returns only terminal/conflict outcomes',
      [200, 409].includes(gradeRace.status) && submitRace.status === 200,
      `grade=${gradeRace.status} submit=${submitRace.status}`)
    const raceRows = await root.from('writing_submissions').select('ai_score').eq('attempt_id', raceAttemptId)
    const raceAtt = await root.from('attempts').select('status, band').eq('id', raceAttemptId).single()
    const noPlaceholder = (raceRows.data ?? []).every((row) => row.ai_score != null)
    const consistentWinner = gradeRace.status === 200
      ? (raceRows.data ?? []).length === 1 && raceAtt.data?.band != null
      : (raceRows.data ?? []).length === 0 && raceAtt.data?.band == null
    check('race leaves no null placeholder and DB state matches winner',
      noPlaceholder && consistentWinner && raceAtt.data?.status === 'submitted',
      JSON.stringify({ grade: gradeRace.status, rows: raceRows.data, attempt: raceAtt.data }))

    await root.from('writing_submissions').delete().eq('user_id', userId)
    await root.from('attempts').delete().eq('user_id', userId)
    if (testId) await root.from('tests').delete().eq('id', testId)
    await root.auth.admin.deleteUser(userId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
