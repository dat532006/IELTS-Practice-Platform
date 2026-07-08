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
// Webhook SePay: POST JSON + header "Authorization: Apikey <key>".
async function sepayHook(body, key) {
  const r = await fetch(`${BASE}/api/payment/webhook/sepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Apikey ${key}` } : {}) },
    body: JSON.stringify(body),
  })
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY, KEY = process.env.SEPAY_API_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (process.env.PAYMENT_GATEWAY_MODE !== 'live' || !KEY || !process.env.SEPAY_BANK_ACCOUNT) {
    console.log('BLOCKED — environment: cần PAYMENT_GATEWAY_MODE=live + SEPAY_API_KEY/SEPAY_BANK_ACCOUNT/SEPAY_BANK_CODE (dummy) cho server lẫn smoke')
    return finish()
  }

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
    check('owner mở QR → 200 + memo + qr.sepay.vn + số TK', own.status === 200 && html.includes(ref) && html.includes('qr.sepay.vn') && html.includes(process.env.SEPAY_BANK_ACCOUNT))
    check('QR page KHÔNG lộ SEPAY_API_KEY', !html.includes(KEY))
    const other = await fetch(`${BASE}/payment/qr?ref=${ref}`, { headers: { Cookie: OTHER.cookie } })
    const otherHtml = await other.text()
    check('user khác mở QR → không thấy giao dịch (RLS)', !otherHtml.includes('qr.sepay.vn') || other.status === 404)
    const badRef = await fetch(`${BASE}/payment/qr?ref=TOPUP-zzz`, { headers: { Cookie: USER.cookie } })
    check('ref sai định dạng → 404', badRef.status === 404)
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
    const noKey = await sepayHook(hook(), null)
    check('thiếu Apikey → 401', noKey.status === 401, `got ${noKey.status}`)
    const wrongKey = await sepayHook(hook(), KEY + 'x')
    check('sai Apikey → 401', wrongKey.status === 401)
    const outFlow = await sepayHook(hook({ transferType: 'out' }), KEY)
    check("transferType='out' → ACK, không credit", outFlow.status === 200 && outFlow.body?.success === true)
    const mismatch = await sepayHook(hook({ transferAmount: 90000 }), KEY)
    check('lệch tiền → ACK (đối soát tay), KHÔNG credit', mismatch.status === 200)
    const { data: p0 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins vẫn 0 sau các webhook hỏng', p0?.coins === 0, `coins=${p0?.coins}`)

    const good = await sepayHook(hook(), KEY)
    check('đúng key + đúng tiền + mã trong content → ACK', good.status === 200 && good.body?.success === true)
    const { data: p1 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('credited +100 xương cá', p1?.coins === 100, `coins=${p1?.coins}`)
    const { data: row } = await a.from('transactions').select('status').eq('provider_txn_id', ref).single()
    check("row → 'success'", row?.status === 'success')

    const replay = await sepayHook(hook(), KEY)
    check('SePay retry/replay → ACK, không credit lần 2', replay.status === 200)
    const { data: p2 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
    check('coins giữ 100 sau replay', p2?.coins === 100, `coins=${p2?.coins}`)

    const statusAfter = await fetch(`${BASE}/api/payment/status?ref=${ref}`, { headers: { Cookie: USER.cookie } })
    check('poll sau credit → success', (await statusAfter.json())?.data?.status === 'success')
  }

  console.log('\n— webhook: content KHÔNG có mã / mã UPPERCASE —')
  {
    const noRef = await sepayHook(hook({ id: 999002, content: 'chuyen tien an trua' }), KEY)
    check('không có mã TOPUP → ACK (ngoài luồng)', noRef.status === 200 && noRef.body?.success === true)

    // Mã bị ngân hàng UPPERCASE + mất dấu '-' vẫn khớp (extractTopupRef linh hoạt).
    const cr2 = await fetch(`${BASE}/api/payment/create`, {
      method: 'POST', headers: { 'content-type': 'application/json', Cookie: USER.cookie },
      body: JSON.stringify({ amount_vnd: 60000, provider: 'bank' }),
    })
    const ref2 = (await cr2.json())?.data?.provider_txn_id
    const upper = await sepayHook(hook({ id: 999003, transferAmount: 60000, content: `CK ${ref2.replace('-', ' ').toUpperCase()} tks` }), KEY)
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
