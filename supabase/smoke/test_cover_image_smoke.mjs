// Runtime smoke — Test cover image (upload ảnh minh họa đề → tests.cover_image → hiện trang pre-exam).
// Prereq: Supabase local + migrations (20260712000200) + next dev/start (:3100).
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/test_cover_image_smoke.mjs
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
  await admin.auth.admin.createUser({ email, password: 'cover-smoke-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'cover-smoke-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { session: data.session, cookie: ssrCookie(url, data.session) }
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
// 1x1 PNG (đủ để test upload + mime image/png).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

const TEST_BODY = {
  slug: 'cover-smoke-reading', title: '[Smoke] Cover Image Reading', type: 'reading', is_free: true,
  difficulty: 3, duration_sec: 3600, question_types: ['gap_filling'],
  passages: [{ id: 'p1', number: 1, title: 'P', content: 'Passage.' }],
  questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling', instruction: 'ONE WORD', points: 1 }],
  answer_keys: { q1: { type: 'gap_filling', answers: ['cat'], match: 'ci', points: 1 } },
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.error('Thiếu env Supabase'); process.exit(2) }
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log('→ Cover image smoke @', BASE)
  const admin = await signIn(url, anon, service, 'cover-smoke-admin@ielts.test', 'admin')
  const user = await signIn(url, anon, service, 'cover-smoke-user@ielts.test', 'user')

  // Dọn test cũ (idempotent): xóa dependents rồi test theo slug.
  const { data: old } = await svc.from('tests').select('id').eq('slug', TEST_BODY.slug).maybeSingle()
  if (old?.id) {
    for (const t of ['answer_keys', 'collection_tests', 'test_unlocks', 'bookmarks', 'attempts']) await svc.from(t).delete().eq('test_id', old.id)
    await svc.from('tests').delete().eq('id', old.id)
  }

  // Tạo đề draft.
  const created = await api('POST', '/api/admin/tests', admin.cookie, TEST_BODY)
  check('tạo đề draft → 201', created.status === 201, `status=${created.status}`)
  const testId = created.body?.data?.test_id
  if (!testId) { console.log('\nKhông tạo được đề — dừng.'); process.exit(1) }

  // Guard: user thường KHÔNG được presign image.
  const naMedia = await api('POST', '/api/admin/media', user.cookie, { kind: 'image', filename: 'x.png', test_id: testId })
  check('user thường POST media image → 403', naMedia.status === 403, `status=${naMedia.status}`)

  // Admin presign image.
  const media = await api('POST', '/api/admin/media', admin.cookie, { kind: 'image', filename: 'cover.png', content_type: 'image/png', test_id: testId })
  check('admin presign image → 200', media.status === 200, `status=${media.status}`)
  const { upload_url, path, token, bucket, public_url } = media.body?.data ?? {}
  check('presign trả bucket + public_url + token', !!(bucket && public_url && token && upload_url && path), JSON.stringify(media.body?.data ?? {}))

  // Upload file thật lên signed URL.
  let uploaded = false
  if (path && token && bucket) {
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await c.storage.from(bucket).uploadToSignedUrl(path, token, PNG, { contentType: 'image/png' })
    uploaded = !error
    check('upload file lên signed URL → ok', uploaded, error?.message ?? '')
  }

  // Public GET (không auth) → ảnh phải xem được.
  if (public_url) {
    const r = await fetch(public_url)
    check('public GET ảnh (no auth) → 200 image/*', r.status === 200 && (r.headers.get('content-type') || '').startsWith('image/'), `status=${r.status}`)
  }

  // Guard: user thường KHÔNG PATCH được cover_image.
  const naPatch = await api('PATCH', `/api/admin/tests/${testId}`, user.cookie, { cover_image: public_url })
  check('user thường PATCH cover_image → 403', naPatch.status === 403, `status=${naPatch.status}`)

  // Validation: cover_image không phải URL → 400.
  const badPatch = await api('PATCH', `/api/admin/tests/${testId}`, admin.cookie, { cover_image: 'not-a-url' })
  check('PATCH cover_image sai URL → 400', badPatch.status === 400, `status=${badPatch.status}`)

  // Admin lưu cover_image.
  const setPatch = await api('PATCH', `/api/admin/tests/${testId}`, admin.cookie, { cover_image: public_url })
  check('admin PATCH cover_image hợp lệ → 200', setPatch.status === 200, `status=${setPatch.status}`)
  const { data: row1 } = await svc.from('tests').select('cover_image').eq('id', testId).maybeSingle()
  check('DB tests.cover_image = public_url', row1?.cover_image === public_url, `db=${row1?.cover_image}`)

  // Publish để trang public đọc được (RLS published).
  await api('POST', `/api/admin/tests/${testId}/publish`, admin.cookie)
  // getTestMeta (anon) phải trả cover_image (grant cột).
  const anonSel = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: metaRow } = await anonSel.from('tests').select('id, cover_image').eq('id', testId).maybeSingle()
  check('anon đọc được cover_image (grant cột)', metaRow?.cover_image === public_url, `anon=${metaRow?.cover_image}`)

  // Gỡ ảnh: PATCH null → clear.
  const clr = await api('PATCH', `/api/admin/tests/${testId}`, admin.cookie, { cover_image: null })
  check('admin PATCH cover_image=null (gỡ) → 200', clr.status === 200, `status=${clr.status}`)
  const { data: row2 } = await svc.from('tests').select('cover_image').eq('id', testId).maybeSingle()
  check('DB cover_image đã null sau gỡ', row2?.cover_image === null, `db=${row2?.cover_image}`)

  // Cleanup: xóa object storage + đề (đã publish → cần dọn dependents rồi hard delete qua service role).
  if (path && bucket) await svc.storage.from(bucket).remove([path])
  for (const t of ['answer_keys', 'collection_tests', 'test_unlocks', 'bookmarks', 'attempts']) await svc.from(t).delete().eq('test_id', testId)
  await svc.from('tests').delete().eq('id', testId)

  console.log(`\n== ${pass} passed, ${fail} failed ==`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
