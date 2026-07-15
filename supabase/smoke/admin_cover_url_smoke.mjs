// Admin cover URL smoke (STORE-003) — PATCH /api/admin/tests/[id] cover_image: URL Storage public hợp lệ
// → 200; javascript:/host lạ/data: → 400. Prereq: Supabase local + next dev (:3100).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_cover_url_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `cover-${Date.now().toString(36)}-`
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
  const made = await root.auth.admin.createUser({ email, password: 'cover-123', email_confirm: true })
  const adminId = made.data.user.id
  await root.from('profiles').update({ role: 'admin' }).eq('id', adminId)
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'cover-123' })
  const cookie = ssrCookie(url, signed.data.session)
  const SB = new URL(url).origin
  let testId
  try {
    const t = await root.from('tests').insert({ slug: `${PREFIX}t`, title: '[cover]', type: 'reading', status: 'draft', passages: [], questions: [] }).select('id').single()
    testId = t.data.id
    const good = `${SB}/storage/v1/object/public/media/${PREFIX}cover.png`
    check('cover Storage public hợp lệ → 200', (await api('PATCH', `/api/admin/tests/${testId}`, cookie, { cover_image: good })).status === 200)
    check('cover = null (gỡ ảnh) → 200', (await api('PATCH', `/api/admin/tests/${testId}`, cookie, { cover_image: null })).status === 200)
    check('cover javascript: → 400', (await api('PATCH', `/api/admin/tests/${testId}`, cookie, { cover_image: 'javascript:alert(1)' })).status === 400)
    check('cover host lạ (tracker) → 400', (await api('PATCH', `/api/admin/tests/${testId}`, cookie, { cover_image: 'https://evil.example.com/storage/v1/object/public/media/x.png' })).status === 400)
    check('cover data: uri → 400', (await api('PATCH', `/api/admin/tests/${testId}`, cookie, { cover_image: 'data:image/png;base64,iVBORw0KGgo=' })).status === 400)
    check('cover origin đúng path sign → 400', (await api('PATCH', `/api/admin/tests/${testId}`, cookie, { cover_image: `${SB}/storage/v1/object/sign/media/x.png` })).status === 400)
    // xác nhận cover độc KHÔNG lọt vào DB
    const row = await root.from('tests').select('cover_image').eq('id', testId).single()
    check('DB cover_image KHÔNG chứa URL độc (đã null hoá lần cuối hợp lệ)', row.data?.cover_image == null, JSON.stringify(row.data))
  } finally {
    if (testId) await root.from('tests').delete().eq('id', testId)
    await root.auth.admin.deleteUser(adminId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
