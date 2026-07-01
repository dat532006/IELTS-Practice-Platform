// W15 runtime smoke — Checkout · Redeem · Webhook Topup · Cart (M08). payment_redeem_contract §1/§2/§3.
// Prereq: Supabase local + ACTIVATION_CODE_PEPPER + PAYMENT_WEBHOOK_SECRET in .env.local + next start (:3100).
// Usage: SMOKE_BASE=... node supabase/smoke/payment_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
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
  const name = `sb-${ref}-auth-token`, value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email, role) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'w15-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w15-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { admin, session: data.session, cookie: ssrCookie(url, data.session), id: data.session.user.id }
}
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let body = null; try { body = await r.json() } catch { /* */ }
  return { status: r.status, body }
}
function webhookSig(payload, secret) {
  const canonical = Object.keys(payload).filter((k) => k !== 'signature').sort().map((k) => `${k}=${payload[k]}`).join('&')
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
}
const setCoins = (admin, uid, n) => admin.from('profiles').update({ coins: n }).eq('id', uid)

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY, webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (!process.env.ACTIVATION_CODE_PEPPER || !webhookSecret) { console.log('BLOCKED — environment: thiếu ACTIVATION_CODE_PEPPER / PAYMENT_WEBHOOK_SECRET'); return finish() }

  const ADMIN = await signIn(url, anon, service, 'w15-admin@test.dev', 'admin')
  const USER = await signIn(url, anon, service, 'w15-user@test.dev', 'user')
  const USER2 = await signIn(url, anon, service, 'w15-user2@test.dev', 'user')
  const a = ADMIN.admin

  // ---- cleanup (dependency order: con → cha) ----
  const { data: oldProds } = await a.from('products').select('id').like('slug', 'w15-smoke%')
  const oldIds = (oldProds ?? []).map((p) => p.id)
  for (const u of [USER.id, USER2.id]) {
    await a.from('product_unlocks').delete().eq('user_id', u)
    await a.from('test_unlocks').delete().eq('user_id', u)
    await a.from('redemptions').delete().eq('user_id', u)
    const { data: ords } = await a.from('orders').select('id').eq('user_id', u)
    for (const o of (ords ?? [])) await a.from('order_items').delete().eq('order_id', o.id)
    await a.from('transactions').delete().eq('user_id', u)
    await a.from('orders').delete().eq('user_id', u)
    await a.from('cart_items').delete().eq('user_id', u)
  }
  if (oldIds.length) await a.from('activation_codes').delete().in('product_id', oldIds)
  await a.from('tests').delete().like('slug', 'w15-smoke%')
  await a.from('products').delete().like('slug', 'w15-smoke%')

  // ---- seed ----
  const mkTest = async (slug) => (await a.from('tests').insert({ slug, title: slug, type: 'reading', is_free: false, status: 'published', passages: [{ id: 'p1', content: 'premium passage ' + slug }], questions: [{ id: 'q1', number: 1, type: 'gap_filling' }] }).select('id').single()).data.id
  const mkProd = async (slug, price) => (await a.from('products').insert({ slug, title: slug, kind: 'single', price_coins: price, status: 'published' }).select('id').single()).data.id
  const t1 = await mkTest('w15-smoke-t1'); const p1 = await mkProd('w15-smoke-p1', 50); await a.from('collection_tests').insert({ product_id: p1, test_id: t1, position: 1 })
  await a.from('answer_keys').insert({ test_id: t1, keys: { q1: { answers: ['secret'], match: 'ci' } } })
  const t2 = await mkTest('w15-smoke-t2'); const p2 = await mkProd('w15-smoke-p2', 30); await a.from('collection_tests').insert({ product_id: p2, test_id: t2, position: 1 })
  const p3 = await mkProd('w15-smoke-p3', 100)
  // clean cart/unlocks/codes for both users
  for (const u of [USER.id, USER2.id]) {
    await a.from('cart_items').delete().eq('user_id', u)
    await a.from('test_unlocks').delete().eq('user_id', u)
    await a.from('product_unlocks').delete().eq('user_id', u)
  }
  // generate codes for p1 via W14 admin API (plaintext once)
  const gen = await api('POST', '/api/admin/activation-codes', ADMIN.cookie, { product_id: p1, count: 2, max_redemptions: 1 })
  const c1 = gen.body?.data?.codes?.[0]?.code, c2 = gen.body?.data?.codes?.[1]?.code
  check('seed: 2 activation codes generated', !!c1 && !!c2, `${gen.status}`)

  // ===== AUTH =====
  check('unauth POST /api/redeem → 401', (await api('POST', '/api/redeem', null, { code: c1 })).status === 401)
  check('unauth POST /api/checkout → 401', (await api('POST', '/api/checkout', null)).status === 401)
  check('unauth POST /api/cart → 401', (await api('POST', '/api/cart', null, { product_id: p1 })).status === 401)

  // ===== REDEEM (§2) =====
  check('redeem mã sai → 404 CODE_NOT_FOUND', (await api('POST', '/api/redeem', USER.cookie, { code: 'NOPE-NOPE-NOPE-NOPE' })).status === 404)
  const rd = await api('POST', '/api/redeem', USER.cookie, { code: c1 })
  check('redeem hợp lệ → unlocked', rd.status === 200 && rd.body?.data?.status === 'unlocked' && rd.body?.data?.product_id === p1, `got ${rd.status} ${JSON.stringify(rd.body?.data)}`)
  // unlocked → /api/exam payload (KHÔNG answer_keys)
  const ex = await api('GET', `/api/exam/${t1}`, USER.cookie)
  check('redeem unlock → GET /api/exam 200 + payload', ex.status === 200 && jsonHas(ex.body?.data, 'premium passage'))
  check('exam payload KHÔNG lộ answer_keys', !jsonHas(ex.body, 'answer_keys') && !jsonHas(ex.body, 'secret'))
  // reuse → already_unlocked
  const rd2 = await api('POST', '/api/redeem', USER.cookie, { code: c1 })
  check('redeem lại → already_unlocked', rd2.status === 200 && rd2.body?.data?.status === 'already_unlocked')
  // sold out: USER redeem c2 (max1) ok; USER2 redeem c2 → SOLD_OUT
  await api('POST', '/api/redeem', USER.cookie, { code: c2 })
  const sold = await api('POST', '/api/redeem', USER2.cookie, { code: c2 })
  check('redeem hết lượt → 409 CODE_SOLD_OUT', sold.status === 409 && sold.body?.meta?.error_code === 'CODE_SOLD_OUT', `got ${sold.status} ${JSON.stringify(sold.body?.meta)}`)

  // ===== CART + CHECKOUT (§1) =====
  check('empty cart checkout → 400 EMPTY_CART', (await api('POST', '/api/checkout', USER.cookie)).status === 400)
  check('cart add product chưa publish/không tồn tại → 404', (await api('POST', '/api/cart', USER.cookie, { product_id: '00000000-0000-0000-0000-0000000000fe' })).status === 404)
  check('cart add p2 → 201', (await api('POST', '/api/cart', USER.cookie, { product_id: p2 })).status === 201)
  await setCoins(a, USER.id, 30)
  const co = await api('POST', '/api/checkout', USER.cookie)
  check('checkout đủ coin → paid total=30', co.status === 200 && co.body?.data?.status === 'paid' && co.body?.data?.total === 30, `got ${co.status} ${JSON.stringify(co.body?.data)}`)
  const { data: prof1 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('coins sau mua = 0', prof1?.coins === 0, `coins=${prof1?.coins}`)
  const ex2 = await api('GET', `/api/exam/${t2}`, USER.cookie)
  check('checkout unlock → GET /api/exam 200 payload', ex2.status === 200 && jsonHas(ex2.body?.data, 'premium passage'))
  // owned → already_owned (no charge)
  await api('POST', '/api/cart', USER.cookie, { product_id: p2 })
  const co2 = await api('POST', '/api/checkout', USER.cookie)
  check('checkout product đã sở hữu → already_owned', co2.status === 200 && co2.body?.data?.status === 'already_owned')
  const { data: prof2 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('already_owned KHÔNG trừ coin (=0)', prof2?.coins === 0)
  // insufficient → 409, no charge, no unlock
  await api('POST', '/api/cart', USER.cookie, { product_id: p3 })
  const ins = await api('POST', '/api/checkout', USER.cookie)
  check('thiếu coin → 409 INSUFFICIENT_COINS', ins.status === 409 && ins.body?.meta?.error_code === 'INSUFFICIENT_COINS', `got ${ins.status}`)
  const { data: prof3 } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  const { count: own3 } = await a.from('product_unlocks').select('*', { count: 'exact', head: true }).eq('user_id', USER.id).eq('product_id', p3)
  check('insufficient: coin không đổi (=0) + KHÔNG unlock p3', prof3?.coins === 0 && own3 === 0, `coins=${prof3?.coins} own=${own3}`)
  check('cart remove p3 → 200', (await api('DELETE', '/api/cart', USER.cookie, { product_id: p3 })).status === 200)

  // ===== TOPUP create + webhook (§3, W16 fixed-rate 1.000 VND = 1 coin) =====
  await setCoins(a, USER.id, 0)
  // client gửi kèm amount_coins giả → server PHẢI bỏ qua, tự tính theo amount_vnd
  const cr = await api('POST', '/api/payment/create', USER.cookie, { amount_vnd: 100000, amount_coins: 999999, provider: 'vnpay' })
  const txnId = cr.body?.data?.provider_txn_id
  check('payment/create → 201 pending (amount_vnd=100000, amount_coins=100)', cr.status === 201 && !!txnId && cr.body?.data?.status === 'pending' && cr.body?.data?.amount_vnd === 100000 && cr.body?.data?.amount_coins === 100, `got ${cr.status} ${JSON.stringify(cr.body?.data)}`)
  check('create bỏ qua amount_coins client gửi (=100, KHÔNG 999999)', cr.body?.data?.amount_coins === 100)
  const { data: profPre } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('create KHÔNG cộng coin (=0)', profPre?.coins === 0)
  // reject: không chia hết 1000
  check('create amount_vnd=100500 (lẻ) → 400', (await api('POST', '/api/payment/create', USER.cookie, { amount_vnd: 100500, provider: 'vnpay' })).status === 400)
  // reject: dưới min 60000
  check('create amount_vnd=50000 (<min) → 400', (await api('POST', '/api/payment/create', USER.cookie, { amount_vnd: 50000, provider: 'vnpay' })).status === 400)
  // bad signature → reject
  const bad = await api('POST', '/api/payment/webhook', null, { provider: 'vnpay', provider_txn_id: txnId, amount: 100000, status: 'success', signature: 'deadbeef' })
  check('webhook chữ ký sai → 400 PAYMENT_SIGNATURE_INVALID', bad.status === 400 && bad.body?.meta?.error_code === 'PAYMENT_SIGNATURE_INVALID', `got ${bad.status}`)
  const { data: profBad } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('chữ ký sai KHÔNG cộng coin (=0)', profBad?.coins === 0)
  // amount mismatch (paid != amount_vnd) → reject, KHÔNG credit
  const mmPayload = { provider: 'vnpay', provider_txn_id: txnId, amount: 90000, status: 'success' }
  const mm = await api('POST', '/api/payment/webhook', null, { ...mmPayload, signature: webhookSig(mmPayload, webhookSecret) })
  check('webhook lệch tiền → 400 PAYMENT_AMOUNT_MISMATCH', mm.status === 400 && mm.body?.meta?.error_code === 'PAYMENT_AMOUNT_MISMATCH', `got ${mm.status} ${JSON.stringify(mm.body?.meta)}`)
  const { data: profMm } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('lệch tiền KHÔNG cộng coin (=0)', profMm?.coins === 0)
  // valid signature + đúng tiền → credited once = 100 coins
  const payload = { provider: 'vnpay', provider_txn_id: txnId, amount: 100000, status: 'success' }
  const ok1 = await api('POST', '/api/payment/webhook', null, { ...payload, signature: webhookSig(payload, webhookSecret) })
  check('webhook đúng → credited true', ok1.status === 200 && ok1.body?.data?.credited === true, `got ${ok1.status} ${JSON.stringify(ok1.body?.data)}`)
  const { data: profCredit } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('topup cộng coin = 100 (100000/1000)', profCredit?.coins === 100)
  // replay → not credited (idempotent), no double
  const ok2 = await api('POST', '/api/payment/webhook', null, { ...payload, signature: webhookSig(payload, webhookSecret) })
  check('webhook lặp → credited false (idempotent)', ok2.status === 200 && ok2.body?.data?.credited === false)
  const { data: profReplay } = await a.from('profiles').select('coins').eq('id', USER.id).single()
  check('replay KHÔNG cộng lại (coins=100)', profReplay?.coins === 100)

  // ===== BUY-NOW 1 VOL bằng coin (W16, KHÔNG cart, KHÔNG activation code) =====
  const t4a = await mkTest('w15-smoke-t4a'); const t4b = await mkTest('w15-smoke-t4b')
  const p4 = await mkProd('w15-smoke-p4', 60)
  await a.from('collection_tests').insert({ product_id: p4, test_id: t4a, position: 1 })
  await a.from('collection_tests').insert({ product_id: p4, test_id: t4b, position: 2 })
  await setCoins(a, USER2.id, 100)
  const bn = await api('POST', '/api/checkout', USER2.cookie, { product_id: p4 })
  check('buy-now đủ coin → paid total=60', bn.status === 200 && bn.body?.data?.status === 'paid' && bn.body?.data?.total === 60, `got ${bn.status} ${JSON.stringify(bn.body?.data)}`)
  const { data: prof4 } = await a.from('profiles').select('coins').eq('id', USER2.id).single()
  check('buy-now còn 40 coin (100-60)', prof4?.coins === 40, `coins=${prof4?.coins}`)
  const { data: pu4 } = await a.from('product_unlocks').select('via').eq('user_id', USER2.id).eq('product_id', p4).single()
  check('buy-now unlock via=purchase', pu4?.via === 'purchase', `via=${pu4?.via}`)
  const { count: tu4 } = await a.from('test_unlocks').select('*', { count: 'exact', head: true }).eq('user_id', USER2.id).eq('product_id', p4)
  check('buy-now expand đúng test_unlocks (=2 collection_tests)', tu4 === 2, `count=${tu4}`)
  const { count: red4 } = await a.from('redemptions').select('*', { count: 'exact', head: true }).eq('user_id', USER2.id).eq('product_id', p4)
  check('buy-now KHÔNG tạo redemption (no activation code)', red4 === 0, `count=${red4}`)
  // double-click buy-now → already_owned, KHÔNG trừ thêm coin
  const bn2 = await api('POST', '/api/checkout', USER2.cookie, { product_id: p4 })
  check('buy-now lần 2 → already_owned (no double-spend)', bn2.status === 200 && bn2.body?.data?.status === 'already_owned')
  const { data: prof4b } = await a.from('profiles').select('coins').eq('id', USER2.id).single()
  check('double-click KHÔNG trừ thêm (coins=40)', prof4b?.coins === 40)
  // thiếu coin → 409, KHÔNG trừ, KHÔNG unlock
  const bnIns = await api('POST', '/api/checkout', USER2.cookie, { product_id: p3 })
  check('buy-now thiếu coin → 409 INSUFFICIENT_COINS', bnIns.status === 409 && bnIns.body?.meta?.error_code === 'INSUFFICIENT_COINS', `got ${bnIns.status}`)
  const { data: prof4c } = await a.from('profiles').select('coins').eq('id', USER2.id).single()
  const { count: own4p3 } = await a.from('product_unlocks').select('*', { count: 'exact', head: true }).eq('user_id', USER2.id).eq('product_id', p3)
  check('thiếu coin: coin không đổi (=40) + KHÔNG unlock p3', prof4c?.coins === 40 && own4p3 === 0, `coins=${prof4c?.coins} own=${own4p3}`)

  finish()
}
function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
