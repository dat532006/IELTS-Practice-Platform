// W18 security smoke — Admin guard matrix + secret/answer_keys leak scan (M08/M11/M12).
// Prereq: Supabase local + next start (:3100). Usage: SMOKE_BASE=... node supabase/smoke/security_leak_smoke.mjs
// Chứng minh: (1) MỌI /api/admin/* chặn unauth(401)/non-admin(403) TRƯỚC service_role;
//             (2) locked exam KHÔNG lộ answer_keys/passages; (3) KHÔNG response nào chứa secret thật.
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
  const name = `sb-${ref}-auth-token`, value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email, role) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'w18-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w18-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { admin, cookie: ssrCookie(url, data.session), id: data.session.user.id }
}
const bodies = [] // gom mọi response body để quét secret
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let text = ''; try { text = await r.text() } catch { /* */ }
  bodies.push(text)
  let json = null; try { json = JSON.parse(text) } catch { /* non-json (csv/html) */ }
  return { status: r.status, text, json }
}
const jsonHas = (o, s) => JSON.stringify(o ?? '').toLowerCase().includes(String(s).toLowerCase())

const DUMMY = '00000000-0000-0000-0000-0000000000ff'
// Ma trận admin: [method, path, body?]. Guard chạy TRƯỚC parse/param → 401/403 bất kể param.
const ADMIN_ENDPOINTS = [
  ['POST', '/api/admin/media', { key: 'x' }],
  ['POST', '/api/admin/activation-codes', { product_id: DUMMY, count: 1 }],
  ['POST', '/api/admin/tests', {}],
  ['PATCH', '/api/admin/tests', {}],
  ['POST', '/api/admin/payments/reconcile'],
  ['GET', '/api/admin/payments/exceptions', undefined],
  ['POST', `/api/admin/payments/exceptions/${DUMMY}/resolve`, { status: 'resolved' }],
  ['POST', '/api/admin/products', {}],
  ['PATCH', '/api/admin/products', {}],
  ['GET', '/api/admin/products', undefined],
  ['POST', `/api/admin/tests/${DUMMY}/publish`],
  ['GET', `/api/admin/tests/${DUMMY}/preview`, undefined],
  ['POST', `/api/admin/products/${DUMMY}/publish`],
  ['POST', `/api/admin/products/${DUMMY}/tests`, {}],
  ['GET', `/api/admin/products/${DUMMY}`, undefined],
]

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }

  const USER = await signIn(url, anon, service, 'w18-user@test.dev', 'user') // non-admin
  const a = USER.admin

  // ===== 1) ADMIN GUARD MATRIX: unauth → 401, non-admin → 403 (TRƯỚC service_role) =====
  let unauth401 = 0, nonadmin403 = 0
  for (const [method, path, body] of ADMIN_ENDPOINTS) {
    const un = await api(method, path, null, body)
    if (un.status === 401) unauth401++; else console.log(`    ⚠️ ${method} ${path} unauth=${un.status} (kỳ vọng 401)`)
    const na = await api(method, path, USER.cookie, body)
    if (na.status === 403) nonadmin403++; else console.log(`    ⚠️ ${method} ${path} non-admin=${na.status} (kỳ vọng 403)`)
  }
  check(`admin matrix: unauth → 401 (${unauth401}/${ADMIN_ENDPOINTS.length})`, unauth401 === ADMIN_ENDPOINTS.length, `${unauth401}/${ADMIN_ENDPOINTS.length}`)
  check(`admin matrix: non-admin → 403 (${nonadmin403}/${ADMIN_ENDPOINTS.length})`, nonadmin403 === ADMIN_ENDPOINTS.length, `${nonadmin403}/${ADMIN_ENDPOINTS.length}`)

  // ===== 2) LEAK: locked premium exam → KHÔNG answer_keys/passages secret =====
  // seed 1 premium test + product (KHÔNG unlock cho USER)
  await a.from('tests').delete().like('slug', 'w18-leak%')
  await a.from('products').delete().like('slug', 'w18-leak%')
  const { data: t } = await a.from('tests').insert({
    slug: 'w18-leak-premium', title: 'w18-leak-premium', type: 'reading', is_free: false, status: 'published',
    passages: [{ id: 'p1', content: 'LEAK-CANARY premium passage' }], questions: [{ id: 'q1', number: 1, type: 'gap_filling' }],
  }).select('id').single()
  await a.from('answer_keys').insert({ test_id: t.id, keys: { q1: { answers: ['LEAK-ANSWER-CANARY'], match: 'ci' } } })
  const locked = await api('GET', `/api/exam/${t.id}`, USER.cookie)
  check('locked premium exam → KHÔNG 200 payload (guard deny)', locked.status !== 200, `status=${locked.status}`)
  check('locked exam KHÔNG lộ answer_keys/đáp án', !jsonHas(locked.json, 'answer') && !jsonHas(locked.json, 'LEAK-ANSWER-CANARY') && !jsonHas(locked.json, 'LEAK-CANARY'), 'canary xuất hiện')

  // ===== 3) SECRET SCAN: KHÔNG response nào chứa secret thật / tên biến bí mật =====
  const needles = [
    ['service_role key', service],
    ['activation pepper', process.env.ACTIVATION_CODE_PEPPER],
    ['webhook secret', process.env.PAYMENT_WEBHOOK_SECRET],
  ].filter(([, v]) => v && String(v).length >= 8)
  const blob = bodies.join('\n')
  for (const [label, secret] of needles) {
    check(`secret scan: KHÔNG lộ ${label} trong bất kỳ response`, !blob.includes(String(secret)))
  }
  check('secret scan: KHÔNG lộ tên biến service_role/pepper/webhook', !/SUPABASE_SERVICE_ROLE_KEY|ACTIVATION_CODE_PEPPER|PAYMENT_WEBHOOK_SECRET/.test(blob))

  finish()
}
function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
