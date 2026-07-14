// Number-word scoring smoke (EXAM-005) — PRODUCTION submit probe: seed reading test có key số + số+cụm,
// nộp bài qua /api/submit, khẳng định: số-chữ ↔ chữ-số THUẦN được chấm đúng; 'One Direction' KHÔNG khớp
// key '1 direction' (không false positive). Prereq: Supabase local + next dev (:3100).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/number_word_scoring_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `numword-${Date.now().toString(36)}-`
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }
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
  let b = null; try { b = await r.json() } catch {}
  return { status: r.status, body: b }
}

// 5 câu: q1 số-chữ↔digit đúng; q2 digit↔số-chữ đúng; q3 compound đúng; q4 semantic KHÔNG khớp (One
//   Direction vs key '1 direction'); q5 exact-mode KHÔNG canon. → raw kỳ vọng = 3 (q1,q2,q3), q4/q5 sai.
const KEYS = {
  q1: { type: 'gap_filling', answers: ['7'], match: 'ci' },
  q2: { type: 'gap_filling', answers: ['twenty-one'], match: 'ci' },
  q3: { type: 'gap_filling', answers: ['105'], match: 'ci' },
  q4: { type: 'gap_filling', answers: ['1 direction'], match: 'ci' },
  q5: { type: 'gap_filling', answers: ['7'], match: 'exact' },
}
const ANSWERS = {
  q1: 'seven',                 // == 7 → đúng
  q2: '21',                    // == twenty-one → đúng
  q3: 'one hundred and five',  // == 105 → đúng
  q4: 'One Direction',         // != '1 direction' (semantic) → SAI (không false positive)
  q5: 'seven',                 // exact mode, 'seven' != '7' → SAI
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `${PREFIX}u@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'numword-123', email_confirm: true })
  const uid = made.data.user.id
  await root.from('profiles').update({ plan: 'pro' }).eq('id', uid)
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'numword-123' })
  const cookie = ssrCookie(url, signed.data.session)
  let testId
  try {
    const t = await root.from('tests').insert({
      slug: `${PREFIX}t`, title: '[numword] scoring', type: 'reading', is_free: true, status: 'published', duration_sec: 3600,
      passages: [{ id: 'p1', number: 1, content: 'x' }],
      questions: Object.keys(KEYS).map((id, i) => ({ id, passage_id: 'p1', number: i + 1, type: 'gap_filling' })),
    }).select('id').single()
    if (t.error) throw t.error
    testId = t.data.id
    await root.from('answer_keys').insert({ test_id: testId, keys: KEYS })

    const start = await api('POST', `/api/exam/${testId}/start`, cookie, {})
    const attemptId = start.body?.data?.attempt_id
    check('start → attempt_id', Boolean(attemptId), JSON.stringify(start.body))

    const sub = await api('POST', '/api/submit', cookie, { attempt_id: attemptId, answers: ANSWERS })
    check('submit → 200', sub.status === 200, `status=${sub.status} ${JSON.stringify(sub.body)}`)
    check('raw_score = 3 (q1,q2,q3 cardinal thuần đúng; q4 semantic + q5 exact SAI)', sub.body?.data?.raw_score === 3, `raw=${sub.body?.data?.raw_score}`)

    // xác nhận per-câu qua review (owner+terminal)
    const res = await api('GET', `/api/result/${attemptId}`, cookie)
    const items = res.body?.data?.review ?? []
    const byId = Object.fromEntries(items.map((it) => [it.question_id, it.is_correct]))
    check('q1 seven==7 đúng', byId.q1 === true)
    check('q2 21==twenty-one đúng', byId.q2 === true)
    check('q3 one hundred and five==105 đúng', byId.q3 === true)
    check('q4 One Direction != 1 direction → SAI (không false positive)', byId.q4 === false, `is_correct=${byId.q4}`)
    check('q5 exact: seven != 7 → SAI', byId.q5 === false, `is_correct=${byId.q5}`)
  } finally {
    await root.from('attempts').delete().eq('test_id', testId)
    await root.from('answer_keys').delete().eq('test_id', testId)
    if (testId) await root.from('tests').delete().eq('id', testId)
    await root.auth.admin.deleteUser(uid).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
