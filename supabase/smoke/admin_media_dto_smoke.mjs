// Admin media DTO smoke (SEC-004) — audio presign response KHÔNG được lộ raw audio_key (định danh
// storage riêng tư). Server VẪN set tests.audio_key (listening authoring còn dùng). Prereq: Supabase
// local + next dev (:3100) có R2 env (dù dummy) để nhánh audio KHÔNG trả 503.
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_media_dto_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `mediadto-${Date.now().toString(36)}-`
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

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `${PREFIX}admin@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'mediadto-123', email_confirm: true })
  const adminId = made.data.user.id
  await root.from('profiles').update({ role: 'admin' }).eq('id', adminId)
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'mediadto-123' })
  const cookie = ssrCookie(url, signed.data.session)
  let testId
  try {
    const t = await root.from('tests').insert({ slug: `${PREFIX}t`, title: '[mediadto]', type: 'listening', status: 'draft', passages: [], questions: [] }).select('id').single()
    testId = t.data.id

    const res = await api('POST', '/api/admin/media', cookie, { kind: 'audio', filename: 'lesson.mp3', test_id: testId })
    if (res.status === 503) { check('R2 chưa cấu hình (503) — cần R2 env để test DTO', false, 'set R2_* dummy env cho dev server'); return finish() }
    check('audio presign → 200', res.status === 200, `status=${res.status} ${JSON.stringify(res.body)}`)
    check('response CÓ upload_url', typeof res.body?.data?.upload_url === 'string')

    // SEC-004: bỏ FIELD audio_key thừa (định danh private tái sử dụng trực tiếp). Lưu ý: upload_url của
    //   presigned PUT BẮT BUỘC chứa object path (client PUT thẳng lên URL đó) — đó là ràng buộc thiết kế
    //   presign, không phải field lộ thừa; muốn ẩn hẳn path phải proxy PUT qua server (redesign STORE-002).
    const keys = Object.keys(res.body?.data ?? {})
    check('SEC-004: response KHÔNG có field audio_key', res.body?.data?.audio_key === undefined, JSON.stringify(keys))
    check('SEC-004: DTO allowlist chỉ {method, upload_url}', keys.length === 2 && keys.includes('method') && keys.includes('upload_url'), JSON.stringify(keys))

    // Server VẪN set tests.audio_key (listening authoring dùng) — chỉ là không LỘ ra client.
    const row = await root.from('tests').select('audio_key').eq('id', testId).single()
    check('server VẪN set tests.audio_key (không lộ ≠ không set)', typeof row.data?.audio_key === 'string' && row.data.audio_key.startsWith(`audio/${testId}/`), JSON.stringify(row.data))
  } finally {
    if (testId) await root.from('tests').delete().eq('id', testId)
    await root.auth.admin.deleteUser(adminId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
