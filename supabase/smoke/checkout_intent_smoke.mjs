// Checkout intent smoke (PAY-001) — buy-now body sai KHÔNG được âm thầm checkout cart.
// Fail-closed: chỉ "không body" mới → cart; body có mặt nhưng sai → 400, KHÔNG mutation.
// Prereq: Supabase local + next dev/start (:3100).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/checkout_intent_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }

function loadEnvLocal() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const line of readFileSync(resolve(rootDir, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
function cookieFor(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`, value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
// jsonApi: body === undefined → KHÔNG gửi body (cart path). rawApi: gửi body literal (malformed JSON).
async function jsonApi(cookie, body) {
  const r = await fetch(`${BASE}/api/checkout`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let j = null; try { j = await r.json() } catch { /* */ }
  return { status: r.status, body: j }
}
async function rawApi(cookie, raw) {
  const r = await fetch(`${BASE}/api/checkout`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie }, body: raw,
  })
  let j = null; try { j = await r.json() } catch { /* */ }
  return { status: r.status, body: j }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) { console.log('SKIP: refuse non-local'); return finish() }

  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const runId = Date.now().toString(36)
  const email = `checkout-intent-${runId}@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'intent-pass-123', email_confirm: true })
  if (made.error || !made.data.user) throw made.error ?? new Error('create user failed')
  const userId = made.data.user.id
  const productIds = []
  try {
    const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const signed = await cli.auth.signInWithPassword({ email, password: 'intent-pass-123' })
    if (signed.error || !signed.data.session) throw signed.error ?? new Error('sign in failed')
    const cookie = cookieFor(url, signed.data.session)

    const mkProduct = async (label, price) => {
      const p = await root.from('products').insert({
        slug: `checkout-intent-${label}-${runId}`, title: `intent ${label}`, kind: 'single', price_coins: price, status: 'published',
      }).select('id').single()
      if (p.error || !p.data) throw p.error ?? new Error('product failed')
      productIds.push(p.data.id)
      return p.data.id
    }
    const productX = await mkProduct('cart', 30) // sẽ nằm trong cart
    const productY = await mkProduct('buynow', 20) // buy-now hợp lệ

    await root.from('profiles').update({ coins: 100 }).eq('id', userId)
    await root.from('cart_items').insert({ user_id: userId, product_id: productX })

    const balance = async () => (await root.from('profiles').select('coins').eq('id', userId).single()).data?.coins
    const cartCount = async () => (await root.from('cart_items').select('*', { count: 'exact', head: true }).eq('user_id', userId)).count
    const unlockCount = async (pid) => (await root.from('product_unlocks').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('product_id', pid)).count

    // 1) Các body buy-now SAI → 400, KHÔNG mutation (balance 100, cart còn 1, chưa unlock gì).
    const invalids = [
      ['product_id không phải uuid', () => jsonApi(cookie, { product_id: 'not-a-uuid' })],
      ['product_id là number', () => jsonApi(cookie, { product_id: 123 })],
      ['sai shape {foo}', () => jsonApi(cookie, { foo: 'bar' })],
      ['product_id rỗng', () => jsonApi(cookie, { product_id: '' })],
      ['object rỗng {}', () => jsonApi(cookie, {})],
      ['JSON hỏng', () => rawApi(cookie, 'not-json{')],
      ['product_id không tồn tại (uuid hợp lệ)', () => jsonApi(cookie, { product_id: '00000000-0000-0000-0000-0000000000ee' })],
    ]
    for (const [name, callit] of invalids) {
      const r = await callit()
      const b = await balance()
      const cc = await cartCount()
      const ux = await unlockCount(productX)
      // uuid hợp lệ nhưng không tồn tại → 404 NOT_FOUND (không phải cart); các case khác → 400.
      const denied = r.status === 400 || r.status === 404
      const notCartCharged = r.body?.data?.status !== 'paid' && b === 100 && cc === 1 && ux === 0
      check(`invalid "${name}" → deny (${r.status}) & KHÔNG charge cart`, denied && notCartCharged, `status=${r.status} bal=${b} cart=${cc} unlockX=${ux} data=${JSON.stringify(r.body?.data)}`)
    }

    // 2) Buy-now HỢP LỆ product Y → 200 paid, trừ 20, unlock Y (cart X không đụng).
    const buy = await jsonApi(cookie, { product_id: productY })
    check('buy-now hợp lệ → paid total=20', buy.status === 200 && buy.body?.data?.status === 'paid' && buy.body?.data?.total === 20, `status=${buy.status} data=${JSON.stringify(buy.body?.data)}`)
    check('buy-now: balance=80, cart vẫn 1, unlock Y=1', (await balance()) === 80 && (await cartCount()) === 1 && (await unlockCount(productY)) === 1)

    // 3) KHÔNG body → checkout cart (X) hoạt động bình thường.
    const cart = await jsonApi(cookie, undefined)
    check('no-body → checkout cart paid total=30', cart.status === 200 && cart.body?.data?.status === 'paid' && cart.body?.data?.total === 30, `status=${cart.status} data=${JSON.stringify(cart.body?.data)}`)
    check('cart checkout: balance=50, cart trống, unlock X=1', (await balance()) === 50 && (await cartCount()) === 0 && (await unlockCount(productX)) === 1)
  } finally {
    const orders = (await root.from('orders').select('id').eq('user_id', userId)).data ?? []
    if (orders.length) await root.from('order_items').delete().in('order_id', orders.map((o) => o.id))
    await root.from('orders').delete().eq('user_id', userId)
    await root.from('product_unlocks').delete().eq('user_id', userId)
    await root.from('test_unlocks').delete().eq('user_id', userId)
    await root.from('cart_items').delete().eq('user_id', userId)
    if (productIds.length) await root.from('products').delete().in('id', productIds)
    await root.auth.admin.deleteUser(userId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error(e); process.exit(1) })
