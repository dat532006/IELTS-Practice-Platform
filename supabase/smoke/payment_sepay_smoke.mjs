// A1-alt runtime smoke — SePay (chuyển khoản VietQR, provider='bank'): create → trang QR → webhook settle.
// Prereq: Supabase local + next start với env:
//   PAYMENT_GATEWAY_MODE=live SEPAY_API_KEY=<dummy> SEPAY_BANK_ACCOUNT=<số tk> SEPAY_BANK_CODE=<bank>
//   Smoke chạy với CÙNG env (đọc từ process env, KHÔNG hardcode secret).
// Usage:
//   PAYMENT_GATEWAY_MODE=live SEPAY_API_KEY=... SEPAY_BANK_ACCOUNT=... SEPAY_BANK_CODE=... \
//     SMOKE_BASE=http://127.0.0.1:3240 node supabase/smoke/payment_sepay_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3240'
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
async function signIn(url, anon, service, email) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'sepay-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'sepay-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { admin, cookie: ssrCookie(url, data.session), id: data.session.user.id }
}
// Webhook SePay — auth theo env (khớp server): SEPAY_WEBHOOK_SECRET → HMAC-SHA256 spec SePay
//   (X-SePay-Signature: sha256=<hex(HMAC(secret, `${ts}.${raw}`))> + X-SePay-Timestamp);
//   không có secret → Apikey header. `authOverride` cho case chữ ký sai/timestamp cũ.
function sepayHeaders(raw, over = {}) {
  // 'secret'/'key' có mặt trong `over` (kể cả null) = override tường minh — null nghĩa là KHÔNG gửi auth.
  const secret = 'secret' in over ? over.secret : process.env.SEPAY_WEBHOOK_SECRET
  if (secret) {
    const ts = over.ts ?? Math.floor(Date.now() / 1000)
    const sig = createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex')
    return { 'x-sepay-signature': `sha256=${sig}`, 'x-sepay-timestamp': String(ts) }
  }
  const key = 'key' in over ? over.key : process.env.SEPAY_API_KEY
  return key ? { authorization: `Apikey ${key}` } : {}
}
async function sepayHook(body, over = {}) {
  const raw = JSON.stringify(body)
  const r = await fetch(`${BASE}/api/payment/webhook/sepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...sepayHeaders(raw, over) },
    body: raw,
  })
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const HMAC = process.env.SEPAY_WEBHOOK_SECRET, KEY = process.env.SEPAY_API_KEY
  const AUTH_SECRET = HMAC || KEY // để check leak + case sai auth
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (process.env.PAYMENT_GATEWAY_MODE !== 'live' || !AUTH_SECRET || !process.env.SEPAY_BANK_ACCOUNT) {
    console.log('BLOCKED — environment: cần PAYMENT_GATEWAY_MODE=live + (SEPAY_WEBHOOK_SECRET hoặc SEPAY_API_KEY) + SEPAY_BANK_ACCOUNT/SEPAY_BANK_CODE (dummy) cho server lẫn smoke')
    return finish()
  }
  console.log(`(auth mode: ${HMAC ? 'HMAC-SHA256' : 'API Key'})`)
  // Case auth SAI theo đúng mode server đang chạy.
  const WRONG_AUTH = HMAC ? { secret: HMAC + 'wrong' } : { key: (KEY ?? '') + 'wrong' }
  const NO_AUTH = { secret: null, key: null }

  const USER = await signIn(url, anon, service, 'sepay-user@test.dev')
  const OTHER = await signIn(url, anon, service, 'sepay-other@test.dev')
  const a = USER.admin
  await a.from('transactions').delete().eq('user_id', USER.id)
  await a.from('transactions').delete().eq('user_id', OTHER.id)
  await a.from('profiles').update({ coins: 0 }).eq('id', USER.id)

  console.log('\n— create (live, bank/SePay) → trang QR nội bộ —')
  const cr = await fetch(`${BASE}/api/payment/create`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: USER.cookie },
    body: JSON.stringify({ amount_vnd: 100000, provider: 'bank' }),
  })
  const crBody = await cr.json().catch(() => null)
  const ref = crBody?.data?.provider_txn_id ?? ''
  check('create → 201', cr.status === 201, `got ${cr.status}`)
  check('redirect_url = /payment/qr nội bộ (không sandbox placeholder)', (crBody?.data?.redirect_url ?? '').startsWith('/payment/qr?ref=TOPUP-'))

  console.log('\n— trang /payment/qr (owner-guard, RLS own-row) —')
  {
    const own = await fetch(`${BASE}/payment/qr?ref=${ref}`, { headers: { Cookie: USER.cookie } })
    const html = await own.text()
    check('owner mở QR → 200 + memo + ảnh proxy same-origin + số TK', own.status === 200 && html.includes(ref) && html.includes('/api/payment/qr-image?ref=') && html.includes(process.env.SEPAY_BANK_ACCOUNT))
    check('QR page KHÔNG lộ secret webhook', !html.includes(AUTH_SECRET))
    const other = await fetch(`${BASE}/payment/qr?ref=${ref}`, { headers: { Cookie: OTHER.cookie } })
    const otherHtml = await other.text()
    check('user khác mở QR → không thấy giao dịch (RLS)', !otherHtml.includes('/api/payment/qr-image') || other.status === 404)
    const badRef = await fetch(`${BASE}/payment/qr?ref=TOPUP-zzz`, { headers: { Cookie: USER.cookie } })
    check('ref sai định dạng → 404', badRef.status === 404)

    // Proxy ảnh QR (same-origin, chống adblock/DNS client chặn qr.sepay.vn) — owner-only.
    const img = await fetch(`${BASE}/api/payment/qr-image?ref=${ref}`, { headers: { Cookie: USER.cookie } })
    check('qr-image owner → 200 image/png', img.status === 200 && (img.headers.get('content-type') ?? '').includes('image'), `got ${img.status} ${img.headers.get('content-type')}`)
    const imgOther = await fetch(`${BASE}/api/payment/qr-image?ref=${ref}`, { headers: { Cookie: OTHER.cookie } })
    check('qr-image user khác → 404', imgOther.status === 404)
    const imgGuest = await fetch(`${BASE}/api/payment/qr-image?ref=${ref}`)
    check('qr-image guest → 401', imgGuest.status === 401)
  }

  console.log('\n— status endpoint (owner-only) —')
  {
    const s1 = await fetch(`${BASE}/api/payment/status?ref=${ref}`, { headers: { Cookie: USER.cookie } })
    const b1 = await s1.json()
    check('owner poll → pending', s1.status === 200 && b1?.data?.status === 'pending')
    const s2 = await fetch(`${BASE}/api/payment/status?ref=${ref}`, { headers: { Cookie: OTHER.cookie } })
    check('user khác poll → 404', s2.status === 404)
    const s3 = await fetch(`${BASE}/api/payment/status?ref=${ref}`)
    check('guest poll → 401', s3.status === 401)
  }

  console.log('\n— webhook SePay: auth + khớp tiền + idempotent —')
  const hook = (over = {}) => ({
    id: 999001, gateway: 'MBBank', transferType: 'in', transferAmount: 100000,
    content: `CT DEN ${ref} GD 123`, referenceCode: 'FT123', accountNumber: process.env.SEPAY_BANK_ACCOUNT, ...over,
  })
  {
    const noAuth = await sepayHook(hook(), NO_AUTH)
    check('thiếu auth → 401', noAuth.status === 401, `got ${noAuth.status}`)
    const wrongAuth = await sepayHook(hook(), WRONG_AUTH)
    check('sai chữ ký/key → 401', wrongAuth.status === 401)
    if (HMAC) {
      const stale = await sepayHook(hook(), { ts: Math.floor(Date.now() / 1000) - 600 })
      check('HMAC timestamp cũ >5 phút → 401 (chống replay)', stale.status === 401)
    }
    const outFlow = await sepayHook(hook({ transferType: 'out' }))
    check("transferType='out' → ACK, không credit", outFlow.status === 200 && outFlow.body?.success === true)
    const mismatch = await sepayHook(hook({ transferAmount: 90000 }))
    check('lệch tiền → ACK (đối soát tay), KHÔNG credit', mismatch.status === 200)
    const { data: p0 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins vẫn 0 sau các webhook hỏng', p0?.coins === 0, `coins=${p0?.coins}`)

    const good = await sepayHook(hook())
    check('auth đúng + đúng tiền + mã trong content → ACK', good.status === 200 && good.body?.success === true)
    const { data: p1 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('credited +100 xương cá', p1?.coins === 100, `coins=${p1?.coins}`)
    const { data: row } = await a.from('transactions').select('status').eq('provider_txn_id', ref).single()
    check("row → 'success'", row?.status === 'success')

    const replay = await sepayHook(hook())
    check('SePay retry/replay → ACK, không credit lần 2', replay.status === 200)
    const { data: p2 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins giữ 100 sau replay', p2?.coins === 100, `coins=${p2?.coins}`)

    const statusAfter = await fetch(`${BASE}/api/payment/status?ref=${ref}`, { headers: { Cookie: USER.cookie } })
    check('poll sau credit → success', (await statusAfter.json())?.data?.status === 'success')
  }

  console.log('\n— webhook: content KHÔNG có mã / mã UPPERCASE —')
  {
    const noRef = await sepayHook(hook({ id: 999002, content: 'chuyen tien an trua' }))
    check('không có mã TOPUP → ACK (ngoài luồng)', noRef.status === 200 && noRef.body?.success === true)

    // Mã bị ngân hàng UPPERCASE + mất dấu '-' vẫn khớp (extractTopupRef linh hoạt).
    const cr2 = await fetch(`${BASE}/api/payment/create`, {
      method: 'POST', headers: { 'content-type': 'application/json', Cookie: USER.cookie },
      body: JSON.stringify({ amount_vnd: 60000, provider: 'bank' }),
    })
    const ref2 = (await cr2.json())?.data?.provider_txn_id
    const upper = await sepayHook(hook({ id: 999003, transferAmount: 60000, content: `CK ${ref2.replace('-', ' ').toUpperCase()} tks` }))
    check('mã UPPERCASE/mất gạch vẫn credit', upper.status === 200)
    const { data: p3 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins = 160 sau lần nạp 2', p3?.coins === 160, `coins=${p3?.coins}`)
  }

  return finish()
}
function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
