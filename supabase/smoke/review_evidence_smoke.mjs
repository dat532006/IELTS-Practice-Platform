// Runtime smoke — Review evidence (2026-07-12): answer_keys.evidence → result review DTO → xem lại trong bài.
// Prereq: Supabase local + migrations + next dev/start (:3100). Usage: node supabase/smoke/review_evidence_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
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
async function signIn(url, anon, service, email, role) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'ev-smoke-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'ev-smoke-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { cookie: ssrCookie(url, data.session) }
}
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let body = null; try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body }
}

const EVIDENCE = 'The quick brown fox jumps over the lazy dog near the river bank.'
const TEST_BODY = {
  slug: 'ev-smoke-reading', title: '[Smoke] Review Evidence', type: 'reading', is_free: true,
  difficulty: 2, duration_sec: 3600, question_types: ['gap_filling'],
  passages: [{ id: 'p1', number: 1, title: 'P1', content: `<p>Opening paragraph.</p><p>${EVIDENCE}</p><p>Closing paragraph.</p>` }],
  questions: [
    { id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling', instruction: 'ONE WORD', prompt: 'The fox jumps over the ___', points: 1 },
    { id: 'q2', passage_id: 'p1', number: 2, type: 'tfng', statement: 'The fox is quick.', points: 1 },
  ],
  answer_keys: {
    q1: { type: 'gap_filling', answers: ['dog'], match: 'ci', points: 1, explanation: 'Nêu rõ trong câu evidence.', evidence: EVIDENCE },
    q2: { type: 'tfng', answers: ['true'], match: 'ci', points: 1 },
  },
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.error('Thiếu env Supabase'); process.exit(2) }
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('→ Review evidence smoke @', BASE)
  const admin = await signIn(url, anon, service, 'ev-smoke-admin@ielts.test', 'admin')
  const user = await signIn(url, anon, service, 'ev-smoke-user@ielts.test', 'user')

  // Dọn cũ (idempotent).
  const { data: old } = await svc.from('tests').select('id').eq('slug', TEST_BODY.slug).maybeSingle()
  if (old?.id) {
    for (const t of ['answer_keys', 'collection_tests', 'test_unlocks', 'bookmarks', 'attempts']) await svc.from(t).delete().eq('test_id', old.id)
    await svc.from('tests').delete().eq('id', old.id)
  }

  // Admin tạo đề (answer_keys có evidence) + publish.
  const created = await api('POST', '/api/admin/tests', admin.cookie, TEST_BODY)
  check('tạo đề (keys có evidence) → 201', created.status === 201, `status=${created.status}`)
  const testId = created.body?.data?.test_id
  if (!testId) { console.log('Không tạo được đề — dừng.'); process.exit(1) }
  const pub = await api('POST', `/api/admin/tests/${testId}/publish`, admin.cookie)
  check('publish → 200', pub.status === 200, `status=${pub.status}`)

  // Evidence KHÔNG được rò vào payload đề thi (LUẬT THÉP #2 — answer_keys server-only).
  const payload = await api('GET', `/api/exam/${testId}`, user.cookie)
  check('user lấy payload → 200', payload.status === 200, `status=${payload.status}`)
  const payloadStr = JSON.stringify(payload.body ?? {})
  check('payload KHÔNG chứa explanation/evidence key nào từ answer_keys', !payloadStr.includes('Nêu rõ trong câu evidence'), 'evidence lộ trong payload!')

  // User làm bài: q1 đúng (dog), q2 sai (false) → nộp.
  const start = await api('POST', `/api/exam/${testId}/start`, user.cookie)
  check('start attempt → 200/201', start.status === 200 || start.status === 201, `status=${start.status}`)
  const attemptId = start.body?.data?.attempt_id
  if (!attemptId) { console.log('Không start được attempt — dừng.'); process.exit(1) }
  // Mutate the live answer key after start. Scoring/review must use the start snapshot.
  const mutated = await api('PATCH', '/api/admin/tests', admin.cookie, {
    ...TEST_BODY,
    id: testId,
    answer_keys: {
      ...TEST_BODY.answer_keys,
      q1: { ...TEST_BODY.answer_keys.q1, answers: ['wolf'] },
    },
  })
  check('admin edits current key after start', mutated.status === 200, `status=${mutated.status}`)
  const submit = await api('POST', '/api/submit', user.cookie, { attempt_id: attemptId, answers: { q1: 'dog', q2: 'false' }, expected_rev: 0 })
  check('submit → 200, raw_score=1', submit.status === 200 && submit.body?.data?.raw_score === 1, `status=${submit.status} raw=${submit.body?.data?.raw_score}`)

  // Result review: evidence + explanation về đúng câu; is_correct đúng.
  const result = await api('GET', `/api/result/${attemptId}`, user.cookie)
  check('GET result → 200', result.status === 200, `status=${result.status}`)
  const review = result.body?.data?.review ?? []
  const r1 = review.find((r) => r.question_id === 'q1')
  const r2 = review.find((r) => r.question_id === 'q2')
  check('q1: is_correct=true + evidence đúng nguyên văn', r1?.is_correct === true && r1?.evidence?.quote === EVIDENCE, JSON.stringify(r1 ?? null))
  check('q1: explanation đi kèm', r1?.explanation === 'Nêu rõ trong câu evidence.', `exp=${r1?.explanation}`)
  check('q2: is_correct=false + KHÔNG có evidence (không nhập)', r2?.is_correct === false && r2?.evidence === undefined, JSON.stringify(r2 ?? null))

  // Guard: user KHÁC không xem được result (owner-only) — evidence không rò.
  const stranger = await signIn(url, anon, service, 'ev-smoke-stranger@ielts.test', 'user')
  const strangerRes = await api('GET', `/api/result/${attemptId}`, stranger.cookie)
  check('user khác GET result → 403/404', strangerRes.status === 403 || strangerRes.status === 404, `status=${strangerRes.status}`)

  // Trang review render được (SSR trả 200 cho owner đã login? — page client fetch; chỉ check route tồn tại, không 500).
  const page = await fetch(`${BASE}/result/${attemptId}/review`, { headers: { Cookie: user.cookie } })
  check('trang /result/[id]/review không 500', page.status === 200, `status=${page.status}`)

  // Cleanup.
  for (const t of ['answer_keys', 'collection_tests', 'test_unlocks', 'bookmarks', 'attempts']) await svc.from(t).delete().eq('test_id', testId)
  await svc.from('tests').delete().eq('id', testId)

  console.log(`\n== ${pass} passed, ${fail} failed ==`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
