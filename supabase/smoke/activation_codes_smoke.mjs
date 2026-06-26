// W14 runtime smoke — Activation code generation & export (HMAC code_hash, no plaintext, admin-only).
// Prereq: Supabase local + ACTIVATION_CODE_PEPPER in .env.local + next start (:3100).
// Usage: SMOKE_BASE=... node supabase/smoke/activation_codes_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const jsonHas = (o, s) => JSON.stringify(o ?? '').toLowerCase().includes(String(s).toLowerCase())
const normalize = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')

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
  await admin.auth.admin.createUser({ email, password: 'w14-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w14-pass-123' })
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
  const ct = r.headers.get('content-type') || ''
  let body = null, text = null
  if (ct.includes('application/json')) { try { body = await r.json() } catch { /* */ } }
  else { try { text = await r.text() } catch { /* */ } }
  return { status: r.status, body, text, contentType: ct }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pepper = process.env.ACTIVATION_CODE_PEPPER
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (!pepper) { console.log('BLOCKED — environment: thiếu ACTIVATION_CODE_PEPPER (.env.local)'); return finish() }

  const ADMIN = await signIn(url, anon, service, 'w14-admin@test.dev', 'admin')
  const USER = await signIn(url, anon, service, 'w14-user@test.dev', 'user')

  // clean + seed product
  await ADMIN.admin.from('products').delete().like('slug', 'w14-smoke%')
  const { data: prod } = await ADMIN.admin
    .from('products').insert({ slug: 'w14-smoke-prod', title: '[W14] Smoke Product', kind: 'single', price_coins: 100, status: 'published' })
    .select('id').single()
  const productId = prod.id
  await ADMIN.admin.from('activation_codes').delete().eq('product_id', productId)

  const GEN_BODY = { product_id: productId, count: 5, max_redemptions: 3, expires_at: '2027-01-01T00:00:00.000Z' }

  // 1) Guard
  check('unauth POST /api/admin/activation-codes → 401', (await api('POST', '/api/admin/activation-codes', null, GEN_BODY)).status === 401)
  const na = await api('POST', '/api/admin/activation-codes', USER.cookie, GEN_BODY)
  check('non-admin POST → 403 FORBIDDEN', na.status === 403 && na.body?.meta?.error_code === 'FORBIDDEN', `got ${na.status}`)

  // 2) Admin generate → 201, plaintext list once
  const gen = await api('POST', '/api/admin/activation-codes', ADMIN.cookie, GEN_BODY)
  check('admin generate → 201', gen.status === 201, `got ${gen.status} ${JSON.stringify(gen.body?.meta)}`)
  check('generated=5 + codes length 5', gen.body?.data?.generated === 5 && (gen.body?.data?.codes?.length ?? 0) === 5)
  const codes = gen.body?.data?.codes ?? []
  check('mỗi code có plaintext + prefix + last4', codes.every((c) => c.code && c.code_prefix && c.code_last4))

  // 3) Response KHÔNG lộ pepper / code_hash
  check('response KHÔNG lộ pepper', !jsonHas(gen.body, pepper))
  check('response KHÔNG có code_hash', !jsonHas(gen.body, 'code_hash'))

  // 4) DB: code_hash = HMAC(normalize(code), pepper); prefix/last4 khớp; KHÔNG plaintext
  const { data: dbRows } = await ADMIN.admin
    .from('activation_codes').select('code_hash, code_prefix, code_last4, product_id, status, max_redemptions, expires_at').eq('product_id', productId)
  check('DB có đúng 5 row', (dbRows?.length ?? 0) === 5, `got ${dbRows?.length}`)
  const hashSet = new Set((dbRows ?? []).map((r) => r.code_hash))
  let hashOk = true, plaintextLeak = false, metaOk = true
  for (const c of codes) {
    const canonical = normalize(c.code)
    const expected = createHmac('sha256', pepper).update(canonical, 'utf8').digest('hex')
    if (!hashSet.has(expected)) hashOk = false
    // KHÔNG có column nào chứa canonical (plaintext) — chỉ prefix(4)/last4(4)/hash(64-hex)
    for (const r of dbRows ?? []) {
      if (r.code_hash === canonical) plaintextLeak = true
      if ((r.code_prefix && r.code_prefix.length > 8) || (r.code_last4 && r.code_last4.length > 8)) plaintextLeak = true
    }
  }
  for (const r of dbRows ?? []) {
    if (!/^[0-9a-f]{64}$/.test(r.code_hash)) hashOk = false
    if (r.status !== 'active' || r.max_redemptions !== 3 || r.product_id !== productId) metaOk = false
  }
  check('DB code_hash = HMAC-SHA256(normalize(code), pepper) cho mọi mã', hashOk)
  check('DB code_hash là 64-hex + status/max/product đúng', metaOk)
  check('DB KHÔNG chứa plaintext (chỉ hash/prefix/last4)', !plaintextLeak)
  check('prefix/last4 khớp canonical', codes.every((c) => {
    const cn = normalize(c.code); return c.code_prefix === cn.slice(0, 4) && c.code_last4 === cn.slice(-4)
  }))

  // 5) Client KHÔNG đọc được activation_codes (RLS deny)
  const userDb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${USER.session.access_token}` } }, auth: { persistSession: false } })
  const acClient = await userDb.from('activation_codes').select('code_hash').limit(1)
  check('client SELECT activation_codes → denied/empty', !!acClient.error || (acClient.data?.length ?? 0) === 0, acClient.error ? '' : 'LEAK')

  // 6) Invalid input
  check('count=0 → 400', (await api('POST', '/api/admin/activation-codes', ADMIN.cookie, { ...GEN_BODY, count: 0 })).status === 400)
  check('product_id không tồn tại → 400', (await api('POST', '/api/admin/activation-codes', ADMIN.cookie, { ...GEN_BODY, product_id: '00000000-0000-0000-0000-0000000000ff' })).status === 400)

  // 7) CSV export (1 lần) — text/csv, header + rows
  const csv = await api('POST', '/api/admin/activation-codes', ADMIN.cookie, { ...GEN_BODY, count: 3, format: 'csv' })
  check('CSV → 201 text/csv', csv.status === 201 && csv.contentType.includes('text/csv'), `got ${csv.status} ${csv.contentType}`)
  const csvLines = (csv.text ?? '').trim().split(/\r?\n/)
  check('CSV header + 3 code rows', csvLines[0] === 'code,product_id,expires_at' && csvLines.length === 4, `lines=${csvLines.length}`)
  check('CSV KHÔNG lộ pepper/code_hash', !jsonHas(csv.text, pepper) && !jsonHas(csv.text, 'code_hash'))

  finish()
}

function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
