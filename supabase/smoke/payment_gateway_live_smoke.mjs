// A1 runtime smoke — gateway LIVE mode (VNPay/MoMo IPN routes + create payUrl + settle invariants).
// ⚠️ Dùng DUMMY creds tự ký 2 chiều: chứng minh code path (verify chữ ký, amount fail-closed, idempotency,
//   failed-never-credit) ĐÚNG và TỰ NHẤT QUÁN — KHÔNG thay thế verify với sandbox chính thức của
//   VNPay/MoMo (cần merchant creds thật, xem PostW19 A1).
// Prereq: Supabase local + next start với env:
//   PAYMENT_GATEWAY_MODE=live VNPAY_SECRET=<dummy> VNPAY_TMN_CODE=<dummy> (+ SMOKE server port riêng)
//   Smoke phải chạy với CÙNG các env đó (đọc từ process env, KHÔNG hardcode secret).
// Usage:
//   PAYMENT_GATEWAY_MODE=live VNPAY_SECRET=... VNPAY_TMN_CODE=... SMOKE_BASE=http://127.0.0.1:3210 \
//     node supabase/smoke/payment_gateway_live_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3210'
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
  await admin.auth.admin.createUser({ email, password: 'a1-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'a1-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  return { admin, cookie: ssrCookie(url, data.session), id: data.session.user.id }
}

// Ký VNPay y hệt lib/payments/vnpay.ts (sort key + encodeURIComponent với space='+', HMAC-SHA512).
const vnpEncode = (v) => encodeURIComponent(v).replace(/%20/g, '+')
function vnpSignQuery(params, secret) {
  const canonical = Object.keys(params)
    .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && params[k] !== '')
    .sort()
    .map((k) => `${k}=${vnpEncode(params[k])}`)
    .join('&')
  return { canonical, sig: createHmac('sha512', secret).update(canonical, 'utf8').digest('hex') }
}
async function vnpayIpn(params, secret) {
  const { canonical, sig } = vnpSignQuery(params, secret)
  const r = await fetch(`${BASE}/api/payment/webhook/vnpay?${canonical}&vnp_SecureHash=${sig}`)
  return r.json()
}
// Ký MoMo IPN y hệt lib/payments/momo.ts (field order cố định, HMAC-SHA256).
function momoSignIpn(b, accessKey, secret) {
  const raw = `accessKey=${accessKey}&amount=${b.amount ?? ''}&extraData=${b.extraData ?? ''}` +
    `&message=${b.message ?? ''}&orderId=${b.orderId ?? ''}&orderInfo=${b.orderInfo ?? ''}` +
    `&orderType=${b.orderType ?? ''}&partnerCode=${b.partnerCode ?? ''}&payType=${b.payType ?? ''}` +
    `&requestId=${b.requestId ?? ''}&responseTime=${b.responseTime ?? ''}` +
    `&resultCode=${b.resultCode ?? ''}&transId=${b.transId ?? ''}`
  return createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
}
async function momoIpn(body) {
  const r = await fetch(`${BASE}/api/payment/webhook/momo`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return r.status
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const VNP_SECRET = process.env.VNPAY_SECRET
  const MOMO_ACCESS = process.env.MOMO_ACCESS_KEY, MOMO_SECRET = process.env.MOMO_SECRET
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (process.env.PAYMENT_GATEWAY_MODE !== 'live' || !VNP_SECRET) {
    console.log('BLOCKED — environment: cần PAYMENT_GATEWAY_MODE=live + VNPAY_SECRET (dummy) cho server lẫn smoke')
    return finish()
  }

  const USER = await signIn(url, anon, service, 'a1-live-user@test.dev')
  const a = USER.admin
  await a.from('transactions').delete().eq('user_id', USER.id)
  await a.from('profiles').update({ coins: 0 }).eq('id', USER.id)

  console.log('\n— live mode: sandbox webhook bị tắt —')
  {
    const r = await fetch(`${BASE}/api/payment/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'vnpay', provider_txn_id: 'x', amount: 1000, signature: 'ab' }),
    })
    check('sandbox webhook (mode=live) → 404', r.status === 404, `got ${r.status}`)
  }

  console.log('\n— VNPay: create payUrl + IPN settle —')
  const cr = await fetch(`${BASE}/api/payment/create`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: USER.cookie },
    body: JSON.stringify({ amount_vnd: 100000, provider: 'vnpay' }),
  })
  const crBody = await cr.json().catch(() => null)
  const payUrl = crBody?.data?.redirect_url ?? ''
  const txnId = crBody?.data?.provider_txn_id ?? ''
  check('create (live,vnpay) → 201', cr.status === 201, `got ${cr.status}`)
  check('payUrl là VNPay thật (không còn placeholder)', payUrl.includes('vnpayment.vn') && !payUrl.includes('sandbox.payments.local'))
  check('payUrl có vnp_SecureHash + vnp_Amount=100000*100', payUrl.includes('vnp_SecureHash=') && payUrl.includes('vnp_Amount=10000000'))
  check('payUrl KHÔNG chứa secret', !payUrl.includes(VNP_SECRET))

  const okParams = (over = {}) => ({
    vnp_TxnRef: txnId, vnp_Amount: '10000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE ?? 'DUMMY', vnp_TransactionNo: '999999', ...over,
  })
  {
    const bad = await vnpayIpn(okParams(), VNP_SECRET + 'wrong')
    check('IPN sai chữ ký → RspCode 97, KHÔNG credit', bad?.RspCode === '97', JSON.stringify(bad))
    const mis = await vnpayIpn(okParams({ vnp_Amount: '9900000' }), VNP_SECRET) // 99k ≠ 100k
    check('IPN lệch tiền → RspCode 04, KHÔNG credit', mis?.RspCode === '04', JSON.stringify(mis))
    const { data: p0 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins vẫn 0 sau 2 IPN hỏng', p0?.coins === 0, `coins=${p0?.coins}`)

    const good = await vnpayIpn(okParams(), VNP_SECRET)
    check('IPN đúng chữ ký + đúng tiền → RspCode 00 (credit)', good?.RspCode === '00', JSON.stringify(good))
    const { data: p1 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('credited +100 coin', p1?.coins === 100, `coins=${p1?.coins}`)
    const replay = await vnpayIpn(okParams(), VNP_SECRET)
    check('IPN replay → RspCode 02, không credit lần 2', replay?.RspCode === '02', JSON.stringify(replay))
    const { data: p2 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins giữ 100 sau replay', p2?.coins === 100, `coins=${p2?.coins}`)
  }

  console.log('\n— VNPay: provider-failed → failed KHÔNG BAO GIỜ credit (contract §3/check36) —')
  {
    const cr2 = await fetch(`${BASE}/api/payment/create`, {
      method: 'POST', headers: { 'content-type': 'application/json', Cookie: USER.cookie },
      body: JSON.stringify({ amount_vnd: 60000, provider: 'vnpay' }),
    })
    const txn2 = (await cr2.json())?.data?.provider_txn_id
    const failedIpn = await vnpayIpn(okParams({ vnp_TxnRef: txn2, vnp_Amount: '6000000', vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }), VNP_SECRET)
    check('IPN provider-failed → RspCode 00 (đã ghi nhận)', failedIpn?.RspCode === '00', JSON.stringify(failedIpn))
    const { data: row } = await a.from('transactions').select('status').eq('provider_txn_id', txn2).single()
    check("row pending → 'failed' (adapter provider đặt)", row?.status === 'failed', `status=${row?.status}`)
    const late = await vnpayIpn(okParams({ vnp_TxnRef: txn2, vnp_Amount: '6000000' }), VNP_SECRET)
    check('IPN success đến SAU failed → 02, KHÔNG credit (failed bất biến)', late?.RspCode === '02', JSON.stringify(late))
    const { data: p3 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins giữ 100 (không credit từ failed)', p3?.coins === 100, `coins=${p3?.coins}`)
  }

  if (MOMO_ACCESS && MOMO_SECRET) {
    console.log('\n— MoMo IPN (dummy creds) —')
    const b = (over = {}) => {
      const base = {
        partnerCode: process.env.MOMO_PARTNER_CODE, orderId: 'MOMO-NO-SUCH-TXN', requestId: 'r1',
        amount: 100000, orderInfo: 'test', orderType: 'momo_wallet', transId: 1, resultCode: 0,
        message: 'ok', payType: 'qr', responseTime: Date.now(), extraData: '', ...over,
      }
      return { ...base, signature: momoSignIpn(base, MOMO_ACCESS, MOMO_SECRET) }
    }
    check('MoMo IPN sai chữ ký → 400', (await momoIpn({ ...b(), signature: 'deadbeef'.repeat(8) })) === 400)
    check('MoMo IPN đúng chữ ký, orderId không tồn tại → 204 (idempotent, không credit)', (await momoIpn(b())) === 204)
    const { data: p4 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins không đổi sau MoMo IPN lạ', p4?.coins === 100, `coins=${p4?.coins}`)
  } else {
    console.log('\n(skip MoMo IPN — không set MOMO_ACCESS_KEY/MOMO_SECRET dummy)')
  }

  return finish()
}
function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
