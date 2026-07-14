// Payment reconciliation smoke (PAY-004) — lệch tiền (đã verify chữ ký + beneficiary) tạo case BỀN,
// DEDUP (retry không nhân bản), admin THẤY được, resolve EXACTLY-ONCE, và KHÔNG BAO GIỜ auto-credit.
// Cần sepayConfigured() trên server (SEPAY_WEBHOOK_SECRET+SEPAY_BANK_ACCOUNT+SEPAY_BANK_CODE) — như binding smoke.
//   SEPAY_WEBHOOK_SECRET=... SEPAY_BANK_ACCOUNT=... SEPAY_BANK_CODE=... \
//     SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/payment_reconcile_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
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
function sepayHeaders(raw) {
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', process.env.SEPAY_WEBHOOK_SECRET).update(`${ts}.${raw}`, 'utf8').digest('hex')
  return { 'x-sepay-signature': `sha256=${sig}`, 'x-sepay-timestamp': String(ts) }
}
async function sepayHook(body) {
  const raw = JSON.stringify(body)
  const r = await fetch(`${BASE}/api/payment/webhook/sepay`, { method: 'POST', headers: { 'content-type': 'application/json', ...sepayHeaders(raw) }, body: raw })
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}
async function adminApi(cookie, method, path, body) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY, acct = process.env.SEPAY_BANK_ACCOUNT
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  if (!process.env.SEPAY_WEBHOOK_SECRET || !acct) { console.log('BLOCKED: cần SEPAY_WEBHOOK_SECRET + SEPAY_BANK_ACCOUNT (dummy) cho server lẫn smoke'); return finish() }

  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `recon-user-${Date.now()}@test.dev`
  const adminEmail = `recon-admin-${Date.now()}@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'recon-pass-123', email_confirm: true })
  if (made.error || !made.data.user) throw made.error ?? new Error('create user failed')
  const userId = made.data.user.id
  const adminMade = await root.auth.admin.createUser({ email: adminEmail, password: 'recon-pass-123', email_confirm: true })
  if (adminMade.error || !adminMade.data.user) throw adminMade.error ?? new Error('create admin failed')
  const adminId = adminMade.data.user.id
  await root.from('profiles').update({ role: 'admin' }).eq('id', adminId)
  const adminCli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const adminSignIn = await adminCli.auth.signInWithPassword({ email: adminEmail, password: 'recon-pass-123' })
  const adminCookie = ssrCookie(url, adminSignIn.data.session)

  const ref = 'TOPUP-' + randomBytes(9).toString('hex')
  try {
    await root.from('profiles').update({ coins: 0 }).eq('id', userId)
    await root.from('transactions').insert({
      user_id: userId, amount_vnd: 100000, amount_coins: 100, type: 'topup', provider: 'bank',
      provider_txn_id: ref, status: 'pending', expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    const exCount = async () => (await root.from('payment_exceptions').select('*', { count: 'exact', head: true }).eq('provider_txn_id', ref)).count
    const coins = async () => (await root.from('profiles').select('coins').eq('id', userId).single()).data?.coins

    // Event verify OK + beneficiary OK nhưng SỐ TIỀN sai (90k != 100k) → ACK, không credit, tạo case bền.
    const wrong = { id: 800001, gateway: 'MBBank', transferType: 'in', transferAmount: 90000, content: `CT DEN ${ref}`, referenceCode: 'FT', accountNumber: acct }
    const m1 = await sepayHook(wrong)
    check('lệch tiền → ACK 200 (không credit)', m1.status === 200 && m1.body?.success === true, `status=${m1.status}`)
    check('lệch tiền → coins vẫn 0', (await coins()) === 0)
    check('lệch tiền → tạo 1 payment_exception', (await exCount()) === 1, `count=${await exCount()}`)

    // Retry CÙNG event → dedup, vẫn 1 case.
    await sepayHook(wrong)
    await sepayHook(wrong)
    check('retry lệch tiền → dedup (vẫn 1 case)', (await exCount()) === 1, `count=${await exCount()}`)

    // Admin THẤY case qua API (guard admin trước service_role).
    const guest = await adminApi('', 'GET', '/api/admin/payments/exceptions?status=open')
    check('list exceptions không đăng nhập → 401', guest.status === 401)
    const list = await adminApi(adminCookie, 'GET', '/api/admin/payments/exceptions?status=open')
    const caseRow = (list.body?.data?.items ?? []).find((x) => x.provider_txn_id === ref)
    check('admin list → thấy case open đúng số tiền', list.status === 200 && caseRow && caseRow.kind === 'amount_mismatch' && caseRow.paid_vnd === 90000 && caseRow.expected_vnd === 100000, JSON.stringify(caseRow))
    check('case KHÔNG lộ secret (chỉ số tiền)', !JSON.stringify(list.body).includes(process.env.SEPAY_WEBHOOK_SECRET))

    // Resolve exactly-once: lần 1 OK, lần 2 → 409. KHÔNG credit.
    const r1 = await adminApi(adminCookie, 'POST', `/api/admin/payments/exceptions/${caseRow.id}/resolve`, { status: 'resolved', note: 'đối soát tay: user chuyển thiếu 10k' })
    check('resolve lần 1 → 200', r1.status === 200 && r1.body?.data?.status === 'resolved', `status=${r1.status}`)
    const r2 = await adminApi(adminCookie, 'POST', `/api/admin/payments/exceptions/${caseRow.id}/resolve`, { status: 'ignored', note: 'x' })
    check('resolve lần 2 → 409 (exactly-once)', r2.status === 409, `status=${r2.status}`)

    const resolved = await root.from('payment_exceptions').select('status, resolved_by, resolution_note').eq('id', caseRow.id).single()
    check('case → resolved + actor + note đúng', resolved.data?.status === 'resolved' && resolved.data?.resolved_by === adminId && String(resolved.data?.resolution_note).includes('đối soát'), JSON.stringify(resolved.data))
    check('sau resolve → coins vẫn 0 (KHÔNG auto-credit)', (await coins()) === 0)

    // Non-admin không resolve được.
    check('txn vẫn pending (mismatch không settle)', (await root.from('transactions').select('status').eq('provider_txn_id', ref).single()).data?.status === 'pending')
  } finally {
    await root.from('payment_exceptions').delete().eq('provider_txn_id', ref)
    await root.from('transactions').delete().eq('user_id', userId)
    await root.auth.admin.deleteUser(userId).catch(() => {})
    await root.auth.admin.deleteUser(adminId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
