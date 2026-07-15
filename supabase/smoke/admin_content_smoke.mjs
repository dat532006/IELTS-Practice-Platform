// W12 runtime smoke — Admin content (test import, answer-key split, preview/publish, media fallback).
// Prereq: Supabase local + migrations + seed + next start (:3100). Usage: SMOKE_BASE=... node supabase/smoke/admin_content_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const SLUG = 'w12-smoke-reading'
const ANSWER_SECRET = 'SECRET_ANSWER_SHOULD_BE_STRIPPED'
const KEY_ANSWER = 'cat'
const SECRET = ['SECRET_ANSWER', 'answer_keys', 'R2_SECRET', 'SERVICE_ROLE', 'service_role_key', KEY_ANSWER]

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const jsonHas = (o, s) => JSON.stringify(o ?? '').toLowerCase().includes(String(s).toLowerCase())

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
  await admin.auth.admin.createUser({ email, password: 'w12-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w12-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { admin, session: data.session, cookie: ssrCookie(url, data.session) }
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

const TEST_BODY = {
  slug: SLUG, title: '[W12] Admin Smoke Reading', type: 'reading', is_free: true, difficulty: 5,
  duration_sec: 3600, question_types: ['gap_filling'],
  passages: [{ id: 'p1', number: 1, title: 'P', content: 'Passage content.' }],
  // câu hỏi cố tình NHÉT field đáp án để kiểm tra strip:
  questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling', instruction: 'ONE WORD', points: 1, answer: ANSWER_SECRET, correct: ANSWER_SECRET }],
  answer_keys: { q1: { type: 'gap_filling', answers: [KEY_ANSWER], match: 'ci', points: 1 } },
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }

  const ADMIN = await signIn(url, anon, service, 'w12-admin@test.dev', 'admin')
  const USER = await signIn(url, anon, service, 'w12-user@test.dev', 'user')

  // clean previous smoke tests (cascade answer_keys)
  await ADMIN.admin.from('tests').delete().like('slug', 'w12-smoke%')

  // 1) Guard: unauth + non-admin → 401/403
  check('unauth POST /api/admin/tests → 401', (await api('POST', '/api/admin/tests', null, TEST_BODY)).status === 401)
  const naCreate = await api('POST', '/api/admin/tests', USER.cookie, TEST_BODY)
  check('non-admin POST /api/admin/tests → 403', naCreate.status === 403, `got ${naCreate.status}`)
  check('403 error_code FORBIDDEN', naCreate.body?.meta?.error_code === 'FORBIDDEN')

  // 2) Admin create → 201, answer-key split, response KHÔNG lộ đáp án
  const cr = await api('POST', '/api/admin/tests', ADMIN.cookie, TEST_BODY)
  check('admin create → 201', cr.status === 201, `got ${cr.status} ${JSON.stringify(cr.body?.meta)}`)
  const testId = cr.body?.data?.test_id
  check('create trả test_id + status=draft', !!testId && cr.body?.data?.status === 'draft')
  for (const s of SECRET) check(`create response KHÔNG lộ "${s}"`, !jsonHas(cr.body, s))

  // 3) DB: tests.questions ĐÃ strip đáp án; answer_keys CÓ keys
  const { data: trow } = await ADMIN.admin.from('tests').select('questions, status, is_free').eq('id', testId).single()
  const q0 = Array.isArray(trow?.questions) ? trow.questions[0] : {}
  check('tests.questions strip "answer"', !('answer' in (q0 ?? {})) && !('correct' in (q0 ?? {})))
  check('tests.questions KHÔNG chứa đáp án secret', !jsonHas(trow?.questions, ANSWER_SECRET))
  const { data: akrow } = await ADMIN.admin.from('answer_keys').select('keys').eq('test_id', testId).single()
  check('answer_keys lưu keys (đáp án ở đây)', akrow?.keys?.q1?.answers?.[0] === KEY_ANSWER)

  // 4) Client KHÔNG đọc được answer_keys (RLS deny)
  const userDb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${USER.session.access_token}` } }, auth: { persistSession: false } })
  const akClient = await userDb.from('answer_keys').select('keys').eq('test_id', testId)
  check('client SELECT answer_keys → denied/empty', !!akClient.error || (akClient.data?.length ?? 0) === 0, akClient.error ? '' : 'LEAK')

  // 5) Preview admin-only
  const naPrev = await api('GET', `/api/admin/tests/${testId}/preview`, USER.cookie)
  check('non-admin preview → 403', naPrev.status === 403, `got ${naPrev.status}`)
  const prev = await api('GET', `/api/admin/tests/${testId}/preview`, ADMIN.cookie)
  check('admin preview → 200 + answer_keys present', prev.status === 200 && prev.body?.data?.answer_keys?.q1?.answers?.[0] === KEY_ANSWER)

  // 6) Publish → published
  const pub = await api('POST', `/api/admin/tests/${testId}/publish`, ADMIN.cookie)
  check('admin publish → 200 status=published', pub.status === 200 && pub.body?.data?.status === 'published', `got ${pub.status}`)

  // 6b) R4 (review hardening): publish reading test THIẾU answer_keys → 400 (chống publish đề không chấm được)
  const noKey = await api('POST', '/api/admin/tests', ADMIN.cookie, {
    ...TEST_BODY, slug: 'w12-smoke-nokey', title: '[W12] No Key', answer_keys: undefined,
    questions: [{ id: 'q1', number: 1, type: 'gap_filling' }],
  })
  const noKeyId = noKey.body?.data?.test_id
  check('R4: seed reading test KHÔNG answer_keys → 201 draft', noKey.status === 201 && !!noKeyId, `got ${noKey.status}`)
  const noKeyPub = await api('POST', `/api/admin/tests/${noKeyId}/publish`, ADMIN.cookie)
  check('R4: publish reading THIẾU answer_keys → 400 VALIDATION_ERROR', noKeyPub.status === 400 && noKeyPub.body?.meta?.error_code === 'VALIDATION_ERROR', `got ${noKeyPub.status} ${JSON.stringify(noKeyPub.body?.meta)}`)
  const { data: nkRow } = await ADMIN.admin.from('tests').select('status').eq('id', noKeyId).single()
  check('R4: đề thiếu keys giữ nguyên draft (KHÔNG publish)', nkRow?.status === 'draft', `status=${nkRow?.status}`)

  // 7) /api/exam no-leak regression (test is_free + published)
  const exam = await api('GET', `/api/exam/${testId}`, USER.cookie)
  check('GET /api/exam → 200 (free+published)', exam.status === 200, `got ${exam.status}`)
  check('exam payload KHÔNG có answer_keys', !jsonHas(exam.body, 'answer_keys') && !jsonHas(exam.body?.data?.questions, 'answer'))
  check('exam payload KHÔNG lộ đáp án', !jsonHas(exam.body, ANSWER_SECRET) && !jsonHas(exam.body, KEY_ANSWER))

  // 8) Media: thiếu R2/bucket → STORAGE_NOT_CONFIGURED (graceful, no secret leak)
  const audio = await api('POST', '/api/admin/media', ADMIN.cookie, { kind: 'audio', filename: 'a.mp3', test_id: testId })
  const mediaConfigContract =
    (audio.status === 503 && audio.body?.meta?.error_code === 'STORAGE_NOT_CONFIGURED') ||
    (audio.status === 200 && typeof audio.body?.data?.upload_url === 'string' && typeof audio.body?.data?.upload_ref === 'string')
  check('admin media audio → 503 khi chưa cấu hình hoặc safe DTO khi đã cấu hình', mediaConfigContract, `got ${audio.status} ${JSON.stringify(audio.body?.meta)}`)
  const naMedia = await api('POST', '/api/admin/media', USER.cookie, { kind: 'audio', filename: 'a.mp3' })
  check('non-admin media → 403', naMedia.status === 403, `got ${naMedia.status}`)
  for (const s of SECRET) check(`media response KHÔNG lộ "${s}"`, !jsonHas(audio.body, s))

  finish()
}

function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
