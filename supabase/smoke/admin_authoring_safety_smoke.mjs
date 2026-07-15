// Admin authoring safety smoke (ADMIN-001/002/003) — alias đáp án KHÔNG lọt exam payload; publish CHẶN
// graph không hợp lệ; xoá hết đáp án KHÔNG để lại key stale; ghi test+key atomic. Prereq: Supabase local
// + next dev (:3100).  SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_authoring_safety_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `authsafe-${Date.now().toString(36)}-`
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
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}
const answer = (v = 'cat') => ({ type: 'gap_filling', answers: [v], match: 'ci', points: 1 })
const body = (slug, over = {}) => ({
  slug: PREFIX + slug, title: `[authsafe] ${slug}`, type: 'reading', is_free: true, duration_sec: 3600,
  passages: [{ id: 'p1', number: 1, title: 'P1', content: 'passage' }],
  questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling' }],
  answer_keys: { q1: answer() }, ...over,
})

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `${PREFIX}admin@test.dev`
  await admin.auth.admin.createUser({ email, password: 'authsafe-123', email_confirm: true }).catch(() => {})
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await auth.auth.signInWithPassword({ email, password: 'authsafe-123' })
  await admin.from('profiles').update({ role: 'admin' }).eq('id', signed.data.session.user.id)
  const cookie = ssrCookie(url, signed.data.session)
  const cleanup = async () => {
    const { data } = await admin.from('tests').select('id').like('slug', `${PREFIX}%`)
    const ids = (data ?? []).map((r) => r.id)
    if (ids.length) { for (const tbl of ['attempts', 'bookmarks', 'test_unlocks', 'collection_tests', 'answer_keys']) await admin.from(tbl).delete().in('test_id', ids); await admin.from('tests').delete().in('id', ids) }
  }
  await cleanup()
  try {
    // ===== ADMIN-001: alias đáp án bị STRIP, KHÔNG lọt exam payload =====
    const LEAK = 'AUTHSAFE_SECRET_9274'
    const create = await api('POST', '/api/admin/tests', cookie, body('alias', {
      questions: [{
        id: 'q1', passage_id: 'p1', number: 1, type: 'mcq_single', prompt: 'Q?',
        correct_answers: [LEAK], answer_keys: { nested: LEAK }, explanation: `exp ${LEAK}`,
        evidence: [{ quote: LEAK }], solution: LEAK,
        options: [{ key: 'A', text: 'opt A', correct: true }, { key: 'B', text: 'opt B' }],
      }],
      answer_keys: { q1: { type: 'mcq', answers: ['A'], match: 'exact', points: 1 } },
    }))
    const leakId = create.body?.data?.test_id
    check('alias fixture create → 201', create.status === 201 && !!leakId, `status=${create.status}`)
    const pub = await api('POST', `/api/admin/tests/${leakId}/publish`, cookie)
    check('alias fixture publish → 200', pub.status === 200, `status=${pub.status} ${pub.body?.message ?? ''}`)
    const exam = await api('GET', `/api/exam/${leakId}`, cookie)
    const examText = JSON.stringify(exam.body ?? {})
    check('exam payload KHÔNG chứa leak token', exam.status === 200 && !examText.includes(LEAK), `has token`)
    check('exam payload KHÔNG chứa alias field (correct_answers/explanation/evidence/solution)', !/correct_answers|explanation|evidence|solution/.test(examText))
    check('exam payload KHÔNG chứa option.correct', !examText.includes('"correct"'))
    check('exam payload GIỮ field hợp lệ (prompt + option key/text)', examText.includes('opt A') && examText.includes('"key":"A"'))

    // ===== ADMIN-002: publish CHẶN graph không hợp lệ =====
    const invalidCases = [
      ['partial-keys (2 câu, 1 key)', body('partial', { questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling' }, { id: 'q2', passage_id: 'p1', number: 2, type: 'gap_filling' }], answer_keys: { q1: answer() } })],
      ['orphan-key (key thừa q999)', body('orphan', { answer_keys: { q1: answer(), q999: answer('x') } })],
      ['duplicate-question-id', body('dup', { questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling' }, { id: 'q1', passage_id: 'p1', number: 2, type: 'gap_filling' }], answer_keys: { q1: answer() } })],
      ['invalid-passage-ref', body('badref', { questions: [{ id: 'q1', passage_id: 'missing', number: 1, type: 'gap_filling' }], answer_keys: { q1: answer() } })],
      ['listening-no-audio', body('listen', { type: 'listening' })],
    ]
    for (const [name, payload] of invalidCases) {
      const c = await api('POST', '/api/admin/tests', cookie, payload)
      const id = c.body?.data?.test_id
      const p = id ? await api('POST', `/api/admin/tests/${id}/publish`, cookie) : { status: 0 }
      check(`publish CHẶN ${name} → 400`, c.status === 201 && p.status === 400, `create=${c.status} publish=${p.status}`)
    }
    // Valid graph vẫn publish được.
    const okCreate = await api('POST', '/api/admin/tests', cookie, body('valid'))
    const okId = okCreate.body?.data?.test_id
    const okPub = await api('POST', `/api/admin/tests/${okId}/publish`, cookie)
    check('publish graph hợp lệ → 200', okPub.status === 200, `status=${okPub.status}`)

    // ===== ADMIN-003: xoá hết đáp án (answer_keys={}) → KHÔNG còn key stale =====
    const st = await api('POST', '/api/admin/tests', cookie, body('clear'))
    const stId = st.body?.data?.test_id
    const prevBefore = await api('GET', `/api/admin/tests/${stId}/preview`, cookie)
    check('trước clear: preview có key q1', prevBefore.body?.data?.answer_keys?.q1?.answers?.[0] === 'cat')
    const patch = await api('PATCH', '/api/admin/tests', cookie, body('clear', { id: stId, answer_keys: {} }))
    check('PATCH clear-all → 200', patch.status === 200, `status=${patch.status}`)
    const prevAfter = await api('GET', `/api/admin/tests/${stId}/preview`, cookie)
    const keysAfter = prevAfter.body?.data?.answer_keys
    // Published rows stay publishable: mutation + keys are validated in the same DB transaction.
    const invalidMutation = await api('PATCH', '/api/admin/tests', cookie, body('valid', { id: okId, answer_keys: {} }))
    check('published test rejects mutation that removes all keys', invalidMutation.status === 400, `status=${invalidMutation.status}`)
    const afterRejectedMutation = await api('GET', `/api/admin/tests/${okId}/preview`, cookie)
    check('rejected mutation rolls back keys and published status',
      afterRejectedMutation.body?.data?.test?.status === 'published' &&
      afterRejectedMutation.body?.data?.answer_keys?.q1?.answers?.[0] === 'cat',
      JSON.stringify(afterRejectedMutation.body?.data ?? null))
    check('sau clear: answer_keys ĐÃ XOÁ (không stale)', keysAfter == null || Object.keys(keysAfter).length === 0, JSON.stringify(keysAfter))

    // ===== ADMIN-003 atomic: absent answer_keys → GIỮ NGUYÊN key cũ =====
    const keep = await api('POST', '/api/admin/tests', cookie, body('keep'))
    const keepId = keep.body?.data?.test_id
    const patchNoKeys = await api('PATCH', '/api/admin/tests', cookie, { id: keepId, title: '[authsafe] keep edited', type: 'reading', questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling' }], passages: [{ id: 'p1', number: 1, content: 'x' }] })
    const keepPrev = await api('GET', `/api/admin/tests/${keepId}/preview`, cookie)
    check('absent answer_keys → giữ key cũ (q1=cat)', patchNoKeys.status === 200 && keepPrev.body?.data?.answer_keys?.q1?.answers?.[0] === 'cat', `status=${patchNoKeys.status} keys=${JSON.stringify(keepPrev.body?.data?.answer_keys)}`)
  } finally {
    await cleanup()
    await admin.auth.admin.deleteUser(signed.data.session.user.id).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
