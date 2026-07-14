// Admin history totals smoke (ADMIN-004) — user có >cap rows: detail phải trả TỔNG THẬT (counts) chứ
// KHÔNG để UI nhầm độ dài mảng đã cap là tổng. Prereq: Supabase local + next dev (:3100).
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_history_totals_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `histtot-${Date.now().toString(36)}-`
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
async function api(method, path, cookie) {
  const r = await fetch(`${BASE}${path}`, { method, headers: cookie ? { Cookie: cookie } : {} })
  let b = null; try { b = await r.json() } catch {}
  return { status: r.status, body: b }
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const adminEmail = `${PREFIX}admin@test.dev`, targetEmail = `${PREFIX}target@test.dev`
  const a = await root.auth.admin.createUser({ email: adminEmail, password: 'histtot-123', email_confirm: true })
  const adminId = a.data.user.id
  await root.from('profiles').update({ role: 'admin' }).eq('id', adminId)
  const t = await root.auth.admin.createUser({ email: targetEmail, password: 'histtot-123', email_confirm: true })
  const targetId = t.data.user.id
  const signed = await admin.auth.signInWithPassword({ email: adminEmail, password: 'histtot-123' })
  const cookie = ssrCookie(url, signed.data.session)

  let testId
  const N_TXN = 105, N_ATT = 103
  try {
    const test = await root.from('tests').insert({ slug: `${PREFIX}t`, title: '[histtot]', type: 'reading', is_free: true, status: 'published',
      passages: [{ id: 'p1', number: 1, content: 'x' }], questions: [] }).select('id').single()
    testId = test.data.id
    // >cap transactions (distinct provider_txn_id) và attempts (distinct started_at)
    const txns = Array.from({ length: N_TXN }, (_, i) => ({ user_id: targetId, type: 'topup', status: 'pending', amount_coins: 1, amount_vnd: 1000, provider: 'bank', provider_txn_id: `${PREFIX}txn-${i}`, created_at: new Date(Date.now() - i * 1000).toISOString() }))
    const atts = Array.from({ length: N_ATT }, (_, i) => ({ user_id: targetId, test_id: testId, status: 'submitted', raw_score: 10, band: 4.5, started_at: new Date(Date.now() - i * 60_000).toISOString(), submitted_at: new Date().toISOString() }))
    const ei = await root.from('transactions').insert(txns); if (ei.error) throw ei.error
    const ea = await root.from('attempts').insert(atts); if (ea.error) throw ea.error

    const res = await api('GET', `/api/admin/users/${targetId}`, cookie)
    const d = res.body?.data
    check('GET detail → 200', res.status === 200 && !!d, `status=${res.status}`)
    check(`transactions ĐÃ CAP ở ${100} (mảng preview)`, d?.transactions?.length === 100, `len=${d?.transactions?.length}`)
    check(`counts.transactions = TỔNG THẬT ${N_TXN} (không phải 100)`, d?.counts?.transactions === N_TXN, `counts=${d?.counts?.transactions}`)
    check(`attempts ĐÃ CAP ở ${100}`, d?.attempts?.length === 100, `len=${d?.attempts?.length}`)
    check(`counts.attempts = TỔNG THẬT ${N_ATT}`, d?.counts?.attempts === N_ATT, `counts=${d?.counts?.attempts}`)
    check('total > shown ⇒ UI phải gắn nhãn "gần nhất / tổng"', d?.counts?.transactions > d?.transactions?.length && d?.counts?.attempts > d?.attempts?.length)
    check('limits có mặt (=100)', d?.limits?.transactions === 100 && d?.limits?.attempts === 100, JSON.stringify(d?.limits))
    // danh sách nhỏ: counts == length (không cap) — nhãn chỉ hiện tổng
    check('user ít lịch sử: unlocks counts == length (0)', d?.counts?.unlocks === d?.unlocks?.length)
  } finally {
    await root.from('transactions').delete().eq('user_id', targetId)
    await root.from('attempts').delete().eq('user_id', targetId)
    if (testId) await root.from('tests').delete().eq('id', testId)
    await root.auth.admin.deleteUser(targetId).catch(() => {})
    await root.auth.admin.deleteUser(adminId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
