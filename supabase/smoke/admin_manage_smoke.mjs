// Admin manage smoke (2026-07-12) — quản lý đề (list/toggle free/xóa 2 tầng/gỡ khỏi VOL)
// + quản lý user (list/detail/chỉnh coin có ledger/ban/stats).
// Prereq: Supabase local + migrations (gồm 20260712000100) + next dev/start. Usage:
//   SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/admin_manage_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const SECRET = ['SERVICE_ROLE', 'service_role_key', 'ACTIVATION_CODE_PEPPER', 'code_hash']

let pass = 0, fail = 0
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${e}`) } }
const jsonHas = (o, s) => JSON.stringify(o ?? '').toLowerCase().includes(String(s).toLowerCase())
const finish = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }

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
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email, role) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'mng-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'mng-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { admin, session: data.session, cookie: ssrCookie(url, data.session), userId: data.session.user.id }
}
async function api(method, path, cookie, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let body = null; try { body = await r.json() } catch { /* non-json */ }
  return { status: r.status, body }
}

const mkTest = (slug, title) => ({
  slug, title, type: 'reading', is_free: false, duration_sec: 3600,
  passages: [{ id: 'p1', number: 1, title: 'P', content: 'Smoke passage.' }],
  questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling', instruction: 'ONE WORD', points: 1 }],
  answer_keys: { q1: { type: 'gap_filling', answers: ['cat'], match: 'ci', points: 1 } },
})

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }

  const ADMIN = await signIn(url, anon, service, 'mng-admin@test.dev', 'admin')
  const USER = await signIn(url, anon, service, 'mng-user@test.dev', 'user')
  // Victim: đối tượng chỉnh coin/ban. Mở khóa ban trước (chạy lại smoke sạch).
  await ADMIN.admin.auth.admin.updateUserById(
    (await ADMIN.admin.from('profiles').select('id').ilike('email', 'mng-victim@test.dev').maybeSingle()).data?.id ?? '00000000-0000-0000-0000-000000000000',
    { ban_duration: 'none' },
  ).catch(() => {})
  const VICTIM = await signIn(url, anon, service, 'mng-victim@test.dev', 'user')

  // cleanup lần chạy trước — xóa dependents TRƯỚC (attempts/unlocks/collection giữ FK tới tests/products)
  const { data: oldTests } = await ADMIN.admin.from('tests').select('id').like('slug', 'mng-smoke%')
  const oldTestIds = (oldTests ?? []).map((x) => x.id)
  if (oldTestIds.length) {
    await ADMIN.admin.from('attempts').delete().in('test_id', oldTestIds)
    await ADMIN.admin.from('test_unlocks').delete().in('test_id', oldTestIds)
    await ADMIN.admin.from('collection_tests').delete().in('test_id', oldTestIds)
    await ADMIN.admin.from('answer_keys').delete().in('test_id', oldTestIds)
    await ADMIN.admin.from('tests').delete().in('id', oldTestIds)
  }
  const { data: oldProds } = await ADMIN.admin.from('products').select('id').like('slug', 'mng-smoke%')
  const oldProdIds = (oldProds ?? []).map((x) => x.id)
  if (oldProdIds.length) {
    await ADMIN.admin.from('test_unlocks').delete().in('product_id', oldProdIds)
    await ADMIN.admin.from('product_unlocks').delete().in('product_id', oldProdIds)
    await ADMIN.admin.from('collection_tests').delete().in('product_id', oldProdIds)
    await ADMIN.admin.from('products').delete().in('id', oldProdIds)
  }

  console.log('\n— A. Quản lý đề —')
  // A1 guards
  check('unauth GET /api/admin/tests → 401', (await api('GET', '/api/admin/tests', null)).status === 401)
  const naList = await api('GET', '/api/admin/tests', USER.cookie)
  check('non-admin GET /api/admin/tests → 403 FORBIDDEN', naList.status === 403 && naList.body?.meta?.error_code === 'FORBIDDEN')

  // A2 tạo 2 đề draft + 1 đề sẽ publish
  const t1 = (await api('POST', '/api/admin/tests', ADMIN.cookie, mkTest('mng-smoke-t1', '[MNG] draft sẽ xóa hẳn'))).body?.data?.test_id
  const t2 = (await api('POST', '/api/admin/tests', ADMIN.cookie, mkTest('mng-smoke-t2', '[MNG] publish rồi ẩn'))).body?.data?.test_id
  const t3 = (await api('POST', '/api/admin/tests', ADMIN.cookie, mkTest('mng-smoke-t3', '[MNG] trong VOL'))).body?.data?.test_id
  check('tạo 3 đề draft', !!t1 && !!t2 && !!t3)

  // A3 list + filter
  const list = await api('GET', '/api/admin/tests?q=mng-smoke&per_page=50', ADMIN.cookie)
  const items = list.body?.data?.items ?? []
  check('GET list trả đủ 3 đề mng-smoke', list.status === 200 && items.filter((x) => String(x.slug).startsWith('mng-smoke')).length === 3, `got ${items.length}`)
  check('list KHÔNG lộ passages/questions/answer_keys', !jsonHas(list.body, 'Smoke passage') && !jsonHas(list.body, 'answer_keys'))
  const draftOnly = await api('GET', '/api/admin/tests?q=mng-smoke&status=draft', ADMIN.cookie)
  check('filter status=draft hoạt động', (draftOnly.body?.data?.items ?? []).length === 3)

  // A4 toggle is_free (meta-only PATCH)
  const tg = await api('PATCH', `/api/admin/tests/${t1}`, ADMIN.cookie, { is_free: true })
  const { data: t1row } = await ADMIN.admin.from('tests').select('is_free').eq('id', t1).single()
  check('PATCH [id] is_free=true → DB đổi', tg.status === 200 && t1row?.is_free === true)
  check('PATCH [id] body lạ → 400', (await api('PATCH', `/api/admin/tests/${t1}`, ADMIN.cookie, { is_free: true, role: 'admin' })).status === 400)
  check('non-admin PATCH [id] → 403', (await api('PATCH', `/api/admin/tests/${t1}`, USER.cookie, { is_free: false })).status === 403)

  // A5 xóa 2 tầng — tầng 1: draft chưa ai làm → xóa hẳn
  const del1 = await api('DELETE', `/api/admin/tests/${t1}`, ADMIN.cookie)
  check('DELETE đề draft → action=deleted', del1.status === 200 && del1.body?.data?.action === 'deleted')
  const { data: gone } = await ADMIN.admin.from('tests').select('id').eq('id', t1)
  const { data: akGone } = await ADMIN.admin.from('answer_keys').select('test_id').eq('test_id', t1)
  check('DB: tests + answer_keys đã xóa hẳn', (gone ?? []).length === 0 && (akGone ?? []).length === 0)

  // A5 tầng 2: đề published → hidden (giữ dữ liệu)
  check('publish t2 → published', (await api('POST', `/api/admin/tests/${t2}/publish`, ADMIN.cookie)).body?.data?.status === 'published')
  const del2 = await api('DELETE', `/api/admin/tests/${t2}`, ADMIN.cookie)
  check('DELETE đề published → action=hidden', del2.status === 200 && del2.body?.data?.action === 'hidden')
  const { data: t2row } = await ADMIN.admin.from('tests').select('status').eq('id', t2).single()
  check('DB: t2 status=hidden (không mất dữ liệu)', t2row?.status === 'hidden')
  // client anon không thấy đề hidden (RLS published-only)
  const anonC = createClient(url, anon, { auth: { persistSession: false } })
  const { data: anonSee } = await anonC.from('tests').select('id').eq('id', t2)
  check('anon KHÔNG thấy đề hidden', (anonSee ?? []).length === 0)
  // khôi phục = publish lại
  check('publish lại đề hidden → published', (await api('POST', `/api/admin/tests/${t2}/publish`, ADMIN.cookie)).body?.data?.status === 'published')

  // A6 gỡ đề khỏi VOL — KHÔNG thu hồi test_unlocks (Owner 2026-07-12)
  const pr = await api('POST', '/api/admin/products', ADMIN.cookie, { slug: 'mng-smoke-vol', title: '[MNG] VOL', kind: 'bundle', price_coins: 10 })
  const pid = pr.body?.data?.product_id
  check('tạo product', !!pid)
  check('publish t3', (await api('POST', `/api/admin/tests/${t3}/publish`, ADMIN.cookie)).status === 200)
  check('bind t3 vào VOL', (await api('POST', `/api/admin/products/${pid}/tests`, ADMIN.cookie, { test_id: t3, position: 1 })).status === 201)
  check('publish product', (await api('POST', `/api/admin/products/${pid}/publish`, ADMIN.cookie)).status === 200)
  // cấp VOL cho victim → expand test_unlocks
  const grant = await ADMIN.admin.rpc('admin_grant_products', { p_user_id: VICTIM.userId, p_product_ids: [pid] })
  check('grant VOL cho victim OK', grant.data?.status === 'OK', JSON.stringify(grant.error ?? grant.data))
  const unbind = await api('DELETE', `/api/admin/products/${pid}/tests`, ADMIN.cookie, { test_id: t3 })
  check('DELETE unbind t3 → removed', unbind.status === 200 && unbind.body?.data?.removed === true)
  const { data: ctGone } = await ADMIN.admin.from('collection_tests').select('test_id').eq('product_id', pid).eq('test_id', t3)
  check('DB: collection_tests đã gỡ', (ctGone ?? []).length === 0)
  const { data: tuKeep } = await ADMIN.admin.from('test_unlocks').select('id').eq('user_id', VICTIM.userId).eq('test_id', t3)
  check('test_unlocks người đã mua VẪN GIỮ (không thu hồi)', (tuKeep ?? []).length === 1, `got ${(tuKeep ?? []).length}`)
  check('unbind lần 2 → removed=false (idempotent)', (await api('DELETE', `/api/admin/products/${pid}/tests`, ADMIN.cookie, { test_id: t3 })).body?.data?.removed === false)

  // victim (đã unlock) start attempt trên t3 → lịch sử làm bài có dữ liệu
  const st = await api('POST', `/api/exam/${t3}/start`, VICTIM.cookie)
  check('victim start attempt t3 (đã unlock) → 200/201', st.status === 200 || st.status === 201, `got ${st.status}`)

  console.log('\n— B. Quản lý user —')
  // B1 guards
  check('unauth GET /api/admin/users → 401', (await api('GET', '/api/admin/users', null)).status === 401)
  check('non-admin GET /api/admin/users → 403', (await api('GET', '/api/admin/users', USER.cookie)).status === 403)

  // B2 list + search
  const ul = await api('GET', '/api/admin/users?q=mng-victim', ADMIN.cookie)
  const urows = ul.body?.data?.items ?? []
  check('search email tìm thấy victim', ul.status === 200 && urows.some((u) => u.email === 'mng-victim@test.dev'))
  for (const s of SECRET) check(`users list KHÔNG lộ "${s}"`, !jsonHas(ul.body, s))

  // B3 detail
  const det = await api('GET', `/api/admin/users/${VICTIM.userId}`, ADMIN.cookie)
  check('detail trả profile đúng email', det.status === 200 && det.body?.data?.profile?.email === 'mng-victim@test.dev')
  check('detail có unlock VOL via=admin', (det.body?.data?.unlocks ?? []).some((u) => u.product_id === pid && u.via === 'admin'))
  check('detail lịch sử làm bài có attempt t3 (kèm tên đề)', (det.body?.data?.attempts ?? []).some((a) => a.test_id === t3 && !!a.test_title))

  // B4 chỉnh coin — ledger bắt buộc
  const coins0 = det.body?.data?.profile?.coins ?? 0
  const add = await api('POST', `/api/admin/users/${VICTIM.userId}/coins`, ADMIN.cookie, { delta: 50, reason: 'smoke cộng thử' })
  check('cộng 50 → coins tăng đúng', add.status === 200 && add.body?.data?.coins === coins0 + 50, JSON.stringify(add.body?.meta))
  const sub = await api('POST', `/api/admin/users/${VICTIM.userId}/coins`, ADMIN.cookie, { delta: -20, reason: 'smoke trừ thử' })
  check('trừ 20 → coins giảm đúng', sub.status === 200 && sub.body?.data?.coins === coins0 + 30)
  // -90000: dưới cap Zod (100k) nhưng trên số dư → phải rơi vào nhánh RPC INSUFFICIENT_COINS.
  const over = await api('POST', `/api/admin/users/${VICTIM.userId}/coins`, ADMIN.cookie, { delta: -90000, reason: 'trừ quá đà' })
  check('trừ quá số dư → 409 INSUFFICIENT_COINS', over.status === 409 && over.body?.meta?.error_code === 'INSUFFICIENT_COINS')
  check('delta=0 → 400', (await api('POST', `/api/admin/users/${VICTIM.userId}/coins`, ADMIN.cookie, { delta: 0, reason: 'abc' })).status === 400)
  check('thiếu lý do → 400', (await api('POST', `/api/admin/users/${VICTIM.userId}/coins`, ADMIN.cookie, { delta: 5, reason: 'a' })).status === 400)
  check('non-admin chỉnh coin → 403', (await api('POST', `/api/admin/users/${VICTIM.userId}/coins`, USER.cookie, { delta: 5, reason: 'hack' })).status === 403)
  // ledger: bonus + adjust có note
  const { data: led } = await ADMIN.admin.from('transactions').select('type, amount_coins, note, status').eq('user_id', VICTIM.userId).order('created_at', { ascending: false }).limit(5)
  check('ledger có bonus(50) kèm note', (led ?? []).some((x) => x.type === 'bonus' && x.amount_coins === 50 && x.note === 'smoke cộng thử' && x.status === 'success'))
  check('ledger có adjust(20) kèm note', (led ?? []).some((x) => x.type === 'adjust' && x.amount_coins === 20 && x.note === 'smoke trừ thử'))

  // B5 ban/unban
  const ban = await api('POST', `/api/admin/users/${VICTIM.userId}/ban`, ADMIN.cookie, { banned: true })
  check('ban → 200', ban.status === 200 && ban.body?.data?.banned === true)
  const cBan = createClient(url, anon, { auth: { persistSession: false } })
  const banned = await cBan.auth.signInWithPassword({ email: 'mng-victim@test.dev', password: 'mng-pass-123' })
  check('user bị ban KHÔNG đăng nhập được', !!banned.error, banned.error?.message ?? 'signed in?!')
  const det2 = await api('GET', `/api/admin/users/${VICTIM.userId}`, ADMIN.cookie)
  check('detail hiện banned=true', det2.body?.data?.profile?.banned === true)
  check('unban → 200', (await api('POST', `/api/admin/users/${VICTIM.userId}/ban`, ADMIN.cookie, { banned: false })).status === 200)
  const unbanned = await cBan.auth.signInWithPassword({ email: 'mng-victim@test.dev', password: 'mng-pass-123' })
  check('sau unban đăng nhập lại được', !unbanned.error, unbanned.error?.message)
  check('admin tự ban chính mình → 400', (await api('POST', `/api/admin/users/${ADMIN.userId}/ban`, ADMIN.cookie, { banned: true })).status === 400)
  check('non-admin ban → 403', (await api('POST', `/api/admin/users/${VICTIM.userId}/ban`, USER.cookie, { banned: true })).status === 403)

  // B6 stats
  const stats = await api('GET', '/api/admin/stats', ADMIN.cookie)
  check('stats trả số thật (users ≥ 3, tests_published ≥ 1)',
    stats.status === 200 && (stats.body?.data?.users ?? 0) >= 3 && (stats.body?.data?.tests_published ?? 0) >= 1,
    JSON.stringify(stats.body?.data))
  check('non-admin stats → 403', (await api('GET', '/api/admin/stats', USER.cookie)).status === 403)

  finish()
}

run().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1) })
