// Topup admission concurrency smoke (PAY-003) — N request tạo topup ĐỒNG THỜI với cap=10 → TỐI ĐA 10
// pending row (không vượt cap dù đua); phần còn lại 429 RATE_LIMITED; đúng #201 == #pending == 10.
// Prereq: Supabase local + next dev (:3100, PAYMENT_GATEWAY_MODE unset = sandbox, TOPUP_MAX_PENDING unset
// = 10).   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/topup_admission_concurrency_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `topupcc-${Date.now().toString(36)}-`
const CAP = 10 // khớp DEFAULT_MAX_PENDING_TOPUPS khi TOPUP_MAX_PENDING không set
const N = 50
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
  const email = `${PREFIX}u@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'topupcc-123', email_confirm: true })
  const uid = made.data.user.id
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'topupcc-123' })
  const cookie = ssrCookie(url, signed.data.session)
  const pendingCount = async () => (await root.from('transactions').select('id', { count: 'exact', head: true })
    .eq('user_id', uid).eq('type', 'topup').eq('status', 'pending')).count ?? 0
  try {
    await root.from('transactions').delete().eq('user_id', uid) // sạch trước

    // N request tạo topup ĐỒNG THỜI (sandbox → placeholder redirect, không gọi cổng ngoài).
    const results = await Promise.all(Array.from({ length: N }, () =>
      api('POST', '/api/payment/create', cookie, { amount_vnd: 60_000, provider: 'bank' })))
    const created = results.filter((r) => r.status === 201).length
    const limited = results.filter((r) => r.status === 429).length
    const other = results.filter((r) => r.status !== 201 && r.status !== 429)
    const rows = await pendingCount()

    check(`pending rows KHÔNG vượt cap: ${rows} ≤ ${CAP}`, rows <= CAP, `rows=${rows}`)
    check(`#201 == cap (${CAP})`, created === CAP, `created=${created}`)
    check(`#pending row == #201 (${created})`, rows === created, `rows=${rows} created=${created}`)
    check(`#429 == N - cap (${N - CAP})`, limited === N - CAP, `limited=${limited}`)
    check('không có status lạ (chỉ 201/429)', other.length === 0, other.map((r) => r.status).join(','))

    // Sau khi hết hạn (giả lập: set expires_at quá khứ) → tạo được tiếp (expired KHÔNG chiếm slot).
    await root.from('transactions').update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('user_id', uid).eq('type', 'topup').eq('status', 'pending')
    const again = await api('POST', '/api/payment/create', cookie, { amount_vnd: 60_000, provider: 'bank' })
    check('pending hết hạn KHÔNG chiếm slot → tạo tiếp được (201)', again.status === 201, `status=${again.status}`)
  } finally {
    await root.from('transactions').delete().eq('user_id', uid)
    await root.auth.admin.deleteUser(uid).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
