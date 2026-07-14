// Admin delete atomicity + lock smoke (ADMIN-005) — xoá đề 2 tầng phải ATOMIC (all-or-nothing) và có
// KHOÁ (không TOCTOU với publish/start-attempt). Kiểm:
//   1) draft + 0 attempt → hard delete, MỌI dependent (answer_keys/collection_tests/test_unlocks/
//      bookmarks) bị dọn sạch.
//   2) published (có attempt) → soft-hide, attempt GIỮ NGUYÊN.
//   3) draft NHƯNG có attempt → soft-hide (không hard delete), test còn.
//   4) ATOMICITY: chèn FK-blocker khiến `delete tests` lỗi giữa chừng → API 500 và KHÔNG để lại trạng
//      thái nửa vời (test + toàn bộ dependent còn nguyên). Pre-fix (multi-statement TS) sẽ để dependents
//      bị xoá còn test ở lại → FAIL. Gỡ blocker → xoá lại thành công.
//   5) LOCK/TOCTOU: publish chen vào (giữ khoá hàng) → RPC quan sát được 'published' → soft-hide (KHÔNG
//      lỡ tay hard-delete đề vừa publish).
// Prereq: Supabase local (Docker) + next dev (:3100). Cần `docker` để chèn FK-blocker + giữ khoá.
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_delete_race_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const CONTAINER = process.env.DB_CONTAINER || 'supabase_db_IELTS_Practice_Platform'
const PREFIX = `admdel-${Date.now().toString(36)}-`
let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  let b = null; try { b = await r.json() } catch { /* */ }
  return { status: r.status, body: b }
}
const PSQL = ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c']
const dbExec = (sql) => execFileSync('docker', [...PSQL, sql], { encoding: 'utf8' }).trim()
// Giữ khoá nền: chạy transaction psql không await để giữ row-lock trong lúc gọi API.
const dbHold = (sql) => spawn('docker', [...PSQL, sql], { stdio: 'ignore' })

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }
  const root = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  // admin user + cookie (route DELETE cần requireAdmin)
  const email = `${PREFIX}admin@test.dev`
  const made = await root.auth.admin.createUser({ email, password: 'admdel-123', email_confirm: true })
  const adminId = made.data.user.id
  await root.from('profiles').update({ role: 'admin' }).eq('id', adminId)
  const cli = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await cli.auth.signInWithPassword({ email, password: 'admdel-123' })
  const cookie = ssrCookie(url, signed.data.session)

  // sản phẩm dùng chung cho test_unlocks/collection_tests dependents
  const prod = await root.from('products').insert({ slug: `${PREFIX}prod`, title: '[admdel] prod', price_coins: 0 }).select('id').single()
  const productId = prod.data.id

  const mkTest = async (slug, status) => {
    const t = await root.from('tests').insert({
      slug: PREFIX + slug, title: `[admdel] ${slug}`, type: 'reading', is_free: true, status,
      passages: [{ id: 'p1', number: 1, content: 'x' }], questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling' }],
    }).select('id').single()
    if (t.error) throw t.error
    return t.data.id
  }
  // seed đủ 4 loại dependent để chứng minh cleanup toàn phần / rollback toàn phần
  const seedDeps = async (testId) => {
    await root.from('answer_keys').insert({ test_id: testId, keys: { q1: { type: 'gap_filling', answers: ['cat'], match: 'ci', points: 1 } } })
    await root.from('collection_tests').insert({ product_id: productId, test_id: testId, position: 0 })
    await root.from('test_unlocks').insert({ user_id: adminId, test_id: testId, product_id: productId })
    await root.from('bookmarks').insert({ user_id: adminId, test_id: testId })
  }
  const depCounts = async (testId) => {
    const one = async (tbl) => (await root.from(tbl).select('*', { count: 'exact', head: true }).eq('test_id', testId)).count ?? 0
    return { answer_keys: await one('answer_keys'), collection_tests: await one('collection_tests'), test_unlocks: await one('test_unlocks'), bookmarks: await one('bookmarks') }
  }
  const testExists = async (testId) => ((await root.from('tests').select('id, status').eq('id', testId).maybeSingle()).data)

  const createdTests = []
  const track = (id) => { createdTests.push(id); return id }
  try {
    dbExec('create table if not exists public._admin_del_blocker (test_id uuid references public.tests(id));')

    // ===== 1) draft + 0 attempt → HARD DELETE, dependents dọn sạch =====
    const t1 = track(await mkTest('clean-draft', 'draft'))
    await seedDeps(t1)
    const d1 = await api('DELETE', `/api/admin/tests/${t1}`, cookie)
    check('draft sạch → DELETE 200 action=deleted', d1.status === 200 && d1.body?.data?.action === 'deleted', `status=${d1.status} ${JSON.stringify(d1.body)}`)
    check('draft sạch → test đã xoá', (await testExists(t1)) == null)
    const c1 = await depCounts(t1)
    check('draft sạch → MỌI dependent đã dọn', c1.answer_keys === 0 && c1.collection_tests === 0 && c1.test_unlocks === 0 && c1.bookmarks === 0, JSON.stringify(c1))

    // ===== 2) published + có attempt → SOFT-HIDE, attempt giữ nguyên =====
    const t2 = track(await mkTest('published', 'published'))
    const att2 = await root.from('attempts').insert({ user_id: adminId, test_id: t2, status: 'submitted', raw_score: 20, band: 5.5 }).select('id').single()
    const d2 = await api('DELETE', `/api/admin/tests/${t2}`, cookie)
    check('published → DELETE 200 action=hidden', d2.status === 200 && d2.body?.data?.action === 'hidden', `status=${d2.status} ${JSON.stringify(d2.body)}`)
    const e2 = await testExists(t2)
    check('published → test còn, status=hidden', e2?.status === 'hidden', JSON.stringify(e2))
    const keptAtt = await root.from('attempts').select('id').eq('id', att2.data.id).maybeSingle()
    check('published → attempt học viên GIỮ NGUYÊN', !!keptAtt.data)

    // ===== 3) draft NHƯNG có attempt → SOFT-HIDE (không hard delete) =====
    const t3 = track(await mkTest('draft-attempt', 'draft'))
    await root.from('attempts').insert({ user_id: adminId, test_id: t3, status: 'in_progress' })
    const d3 = await api('DELETE', `/api/admin/tests/${t3}`, cookie)
    check('draft+attempt → action=hidden (KHÔNG hard delete)', d3.status === 200 && d3.body?.data?.action === 'hidden', JSON.stringify(d3.body))
    check('draft+attempt → test còn', (await testExists(t3)) != null)

    // ===== 4) ATOMICITY: FK-blocker khiến delete tests lỗi → 500 + KHÔNG partial state =====
    const t4 = track(await mkTest('atomic', 'draft'))
    await seedDeps(t4)
    dbExec(`insert into public._admin_del_blocker (test_id) values ('${t4}');`)
    const d4 = await api('DELETE', `/api/admin/tests/${t4}`, cookie)
    check('blocked delete → API 500 (FK chặn)', d4.status === 500, `status=${d4.status} ${JSON.stringify(d4.body)}`)
    check('blocked delete → test VẪN còn (không mất)', (await testExists(t4)) != null)
    const c4 = await depCounts(t4)
    check('blocked delete → dependents NGUYÊN VẸN (rollback, không partial)', c4.answer_keys === 1 && c4.collection_tests === 1 && c4.test_unlocks === 1 && c4.bookmarks === 1, JSON.stringify(c4))
    // gỡ blocker → xoá lại thành công, sạch
    dbExec(`delete from public._admin_del_blocker where test_id='${t4}';`)
    const d4b = await api('DELETE', `/api/admin/tests/${t4}`, cookie)
    check('gỡ blocker → DELETE 200 action=deleted', d4b.status === 200 && d4b.body?.data?.action === 'deleted', JSON.stringify(d4b.body))
    const c4b = await depCounts(t4)
    check('sau gỡ blocker → test + dependents sạch', (await testExists(t4)) == null && c4b.answer_keys === 0 && c4b.collection_tests === 0 && c4b.test_unlocks === 0 && c4b.bookmarks === 0, JSON.stringify(c4b))

    // ===== 5) LOCK/TOCTOU: publish giữ khoá hàng, RPC phải quan sát 'published' → soft-hide =====
    const t5 = track(await mkTest('toctou', 'draft'))
    // holder: BEGIN; publish; giữ ~1.5s; COMMIT — giữ row-lock để RPC delete chờ, rồi đọc được 'published'.
    const holder = dbHold(`begin; update public.tests set status='published' where id='${t5}'; select pg_sleep(1.5); commit;`)
    await sleep(500) // đảm bảo holder đã UPDATE (giữ khoá) trước khi ta gọi DELETE
    const d5 = await api('DELETE', `/api/admin/tests/${t5}`, cookie)
    await new Promise((r) => holder.on('exit', r))
    check('TOCTOU → DELETE observe published → action=hidden (không lỡ hard-delete)', d5.status === 200 && d5.body?.data?.action === 'hidden', `status=${d5.status} ${JSON.stringify(d5.body)}`)
    const e5 = await testExists(t5)
    check('TOCTOU → test CÒN (status=hidden), không bị xoá', e5?.status === 'hidden', JSON.stringify(e5))
  } finally {
    try { dbExec('drop table if exists public._admin_del_blocker;') } catch { /* */ }
    for (const id of createdTests) {
      await root.from('answer_keys').delete().eq('test_id', id)
      await root.from('collection_tests').delete().eq('test_id', id)
      await root.from('test_unlocks').delete().eq('test_id', id)
      await root.from('bookmarks').delete().eq('test_id', id)
      await root.from('attempts').delete().eq('test_id', id)
      await root.from('tests').delete().eq('id', id)
    }
    await root.from('products').delete().eq('id', productId)
    await root.auth.admin.deleteUser(adminId).catch(() => {})
  }
  finish()
}
run().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1) })
