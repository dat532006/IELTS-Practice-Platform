// Admin catalog atomicity smoke (ADMIN-010 atomic reorder + ADMIN-009 durable refresh).
// ADMIN-010: reorder qua endpoint ATOMIC → swap đúng + position DISTINCT (không nửa vời/trùng); test lạ → 404.
//   Contrast: partial swap kiểu cũ (1 bind, bỏ bind thứ 2) → position TRÙNG (chứng minh hazard).
// ADMIN-009: bind published test → product_search.test_count phản ánh (durable refresh chạy).
// Prereq: Supabase local + next dev (:3100).  SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_catalog_atomicity_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const PREFIX = `catatom-${Date.now().toString(36)}-`
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
  const email = `${PREFIX}admin@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'catatom-123', email_confirm: true })
  const adminId = made.data.user.id
  await root.from('profiles').update({ role: 'admin' }).eq('id', adminId)
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'catatom-123' })
  const cookie = ssrCookie(url, signed.data.session)

  const productIds = [], testIds = []
  const mkTest = async (slug, status = 'published') => {
    const t = await root.from('tests').insert({ slug: PREFIX + slug, title: `[catatom] ${slug}`, type: 'reading', is_free: true, status,
      passages: [{ id: 'p1', number: 1, content: 'x' }], questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling' }] }).select('id').single()
    testIds.push(t.data.id); return t.data.id
  }
  const mkProduct = async (slug, status = 'draft') => {
    const p = await root.from('products').insert({ slug: PREFIX + slug, title: `[catatom] ${slug}`, kind: 'bundle', price_coins: 0, status }).select('id').single()
    productIds.push(p.data.id); return p.data.id
  }
  const positions = async (pid) => Object.fromEntries(((await root.from('collection_tests').select('test_id, position').eq('product_id', pid)).data ?? []).map((r) => [r.test_id, r.position]))
  try {
    // ===== ADMIN-010: reorder ATOMIC =====
    const P = await mkProduct('reorder')
    const tA = await mkTest('a'), tB = await mkTest('b'), tC = await mkTest('c')
    for (const [t, pos] of [[tA, 0], [tB, 1], [tC, 2]]) await root.from('collection_tests').insert({ product_id: P, test_id: t, position: pos })

    const re = await api('POST', `/api/admin/products/${P}/tests/reorder`, cookie, { test_id_a: tA, test_id_b: tB })
    check('reorder → 200', re.status === 200, `status=${re.status} ${JSON.stringify(re.body)}`)
    const pos1 = await positions(P)
    check('swap đúng: tA↔tB (tA=1, tB=0, tC=2)', pos1[tA] === 1 && pos1[tB] === 0 && pos1[tC] === 2, JSON.stringify(pos1))
    const vals = Object.values(pos1)
    check('position DISTINCT (không trùng sau reorder)', new Set(vals).size === vals.length, JSON.stringify(pos1))

    const foreign = await mkTest('foreign') // published nhưng KHÔNG bind vào P
    const reNF = await api('POST', `/api/admin/products/${P}/tests/reorder`, cookie, { test_id_a: tA, test_id_b: foreign })
    check('reorder test không thuộc product → 404', reNF.status === 404, `status=${reNF.status}`)
    const reSame = await api('POST', `/api/admin/products/${P}/tests/reorder`, cookie, { test_id_a: tA, test_id_b: tA })
    check('reorder cùng 1 test → 400', reSame.status === 400, `status=${reSame.status}`)

    // ===== Contrast: hazard swap NỬA VỜI kiểu cũ (chỉ 1 bind) → position TRÙNG =====
    const Phz = await mkProduct('hazard')
    const hA = await mkTest('hz-a'), hB = await mkTest('hz-b')
    await root.from('collection_tests').insert({ product_id: Phz, test_id: hA, position: 0 })
    await root.from('collection_tests').insert({ product_id: Phz, test_id: hB, position: 1 })
    // mô phỏng bước 1 của swap cũ (bind hA sang position của hB) rồi "fail" bước 2 → hA,hB cùng position 1
    await api('POST', `/api/admin/products/${Phz}/tests`, cookie, { test_id: hA, position: 1 })
    const posHz = await positions(Phz)
    const hzVals = Object.values(posHz)
    check('hazard: partial swap kiểu cũ TẠO position TRÙNG (chứng minh cần atomic)', new Set(hzVals).size < hzVals.length, JSON.stringify(posHz))

    // ===== ADMIN-009: bind published test → matview phản ánh (durable refresh chạy) =====
    const Ppub = await mkProduct('pub', 'published')
    const tPub = await mkTest('pub-test', 'published')
    const bind = await api('POST', `/api/admin/products/${Ppub}/tests`, cookie, { test_id: tPub, position: 0 })
    check('bind published test → 201', bind.status === 201, `status=${bind.status}`)
    const ps = await root.from('product_search').select('test_count').eq('product_id', Ppub).maybeSingle()
    check('ADMIN-009: product_search.test_count = 1 sau bind (durable refresh)', ps.data?.test_count === 1, JSON.stringify(ps.data))
  } finally {
    for (const pid of productIds) await root.from('collection_tests').delete().eq('product_id', pid)
    if (productIds.length) await root.from('products').delete().in('id', productIds)
    if (testIds.length) await root.from('tests').delete().in('id', testIds)
    try { await root.rpc('refresh_product_search') } catch { /* matview cleanup best-effort */ }
    await root.auth.admin.deleteUser(adminId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
