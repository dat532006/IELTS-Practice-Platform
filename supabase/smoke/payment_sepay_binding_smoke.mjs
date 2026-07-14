// SePay beneficiary binding smoke (PAY-002) — event ký HMAC hợp lệ nhưng accountNumber KHÔNG phải
// tài khoản người bán (SEPAY_BANK_ACCOUNT) thì KHÔNG được credit. Đúng beneficiary (accountNumber
// hoặc subAccount) mới credit. Chỉ cần sepayConfigured() (SEPAY_WEBHOOK_SECRET+SEPAY_BANK_ACCOUNT+
// SEPAY_BANK_CODE) — KHÔNG cần GATEWAY_MODE=live (không đụng sandbox webhook).
//   SEPAY_WEBHOOK_SECRET=... SEPAY_BANK_ACCOUNT=... SEPAY_BANK_CODE=... \
//     SMOKE_BASE=http://127.0.0.1:3201 node supabase/smoke/payment_sepay_binding_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3201'
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }

function loadEnvLocal() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
function sepayHeaders(raw) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex')
  return { 'x-sepay-signature': `sha256=${sig}`, 'x-sepay-timestamp': String(ts) }
}
async function sepayHook(body) {
  const raw = JSON.stringify(body)
  const r = await fetch(`${BASE}/api/payment/webhook/sepay`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...sepayHeaders(raw) }, body: raw,
  })
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const acct = process.env.SEPAY_BANK_ACCOUNT
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (!process.env.SEPAY_WEBHOOK_SECRET || !acct) { console.log('BLOCKED: cần SEPAY_WEBHOOK_SECRET + SEPAY_BANK_ACCOUNT (dummy) cho server lẫn smoke'); return finish() }

  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `sepay-bind-${Date.now()}@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'bind-pass-123', email_confirm: true })
  if (made.error || !made.data.user) throw made.error ?? new Error('create user failed')
  const userId = made.data.user.id

  const mkPending = async (amountVnd, coins) => {
    const ref = 'TOPUP-' + randomBytes(9).toString('hex')
    const ins = await root.from('transactions').insert({
      user_id: userId, amount_vnd: amountVnd, amount_coins: coins, type: 'topup', provider: 'bank',
      provider_txn_id: ref, status: 'pending', expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    if (ins.error) throw ins.error
    return ref
  }
  const coins = async () => (await root.from('profiles').select('coins').eq('id', userId).single()).data?.coins
  const txnStatus = async (ref) => (await root.from('transactions').select('status').eq('provider_txn_id', ref).single()).data?.status
  const hook = (ref, over = {}) => ({
    id: 900001, gateway: 'MBBank', transferType: 'in', transferAmount: 100000,
    content: `CT DEN ${ref} GD`, referenceCode: 'FT1', accountNumber: acct, ...over,
  })

  try {
    await root.from('profiles').update({ coins: 0 }).eq('id', userId)

    // 1) Event ký hợp lệ nhưng accountNumber KHÁC → KHÔNG credit, txn giữ pending.
    const refWrong = await mkPending(100000, 100)
    const wrong = await sepayHook(hook(refWrong, { accountNumber: '0000000009' }))
    check('sai beneficiary → ACK 200', wrong.status === 200 && wrong.body?.success === true, `status=${wrong.status}`)
    check('sai beneficiary → coins vẫn 0', (await coins()) === 0)
    check('sai beneficiary → txn vẫn pending', (await txnStatus(refWrong)) === 'pending')

    // 2) Thiếu accountNumber → fail-closed, không credit.
    const refMissing = await mkPending(100000, 100)
    const missing = await sepayHook({ id: 900002, gateway: 'MBBank', transferType: 'in', transferAmount: 100000, content: `CT DEN ${refMissing}`, referenceCode: 'FT2' })
    check('thiếu accountNumber → ACK 200, không credit', missing.status === 200 && (await txnStatus(refMissing)) === 'pending')
    check('sau 2 event sai → coins vẫn 0', (await coins()) === 0)

    // 3) ĐÚNG beneficiary (accountNumber khớp) → credit +100.
    const refOk = await mkPending(100000, 100)
    const good = await sepayHook(hook(refOk))
    check('đúng beneficiary + đúng tiền → ACK 200', good.status === 200 && good.body?.success === true)
    check('đúng beneficiary → coins +100', (await coins()) === 100, `coins=${await coins()}`)
    check('đúng beneficiary → txn success', (await txnStatus(refOk)) === 'success')

    // 4) subAccount (VA ảo) khớp cũng credit (accountNumber khác, subAccount = tài khoản người bán).
    const refSub = await mkPending(50000, 50)
    const sub = await sepayHook(hook(refSub, { transferAmount: 50000, accountNumber: '1234567890', subAccount: acct }))
    check('subAccount khớp → credit', sub.status === 200 && (await txnStatus(refSub)) === 'success')
    check('sau subAccount → coins = 150', (await coins()) === 150, `coins=${await coins()}`)
  } finally {
    await root.from('transactions').delete().eq('user_id', userId)
    await root.auth.admin.deleteUser(userId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
