// W13 runtime smoke — Admin Product/Bundle Manager & Pricing (CRUD, bind tests, publish + refresh).
// Prereq: Supabase local + migrations + next start (:3100). Usage: SMOKE_BASE=... node supabase/smoke/admin_product_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const TOKEN = 'w13psmoke'
const P_SLUG = 'w13-smoke-bundle'
const ANSWER_SECRET = 'SECRET_ANSWER_SHOULD_NOT_LEAK'
const SECRET = ['service_role', 'SERVICE_ROLE', 'service_role_key', 'answer_keys', 'passages', 'questions', ANSWER_SECRET]

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
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180, parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}
async function signIn(url, anon, service, email, role) {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.auth.admin.createUser({ email, password: 'w13-pass-123', email_confirm: true }).catch(() => {})
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'w13-pass-123' })
  if (error || !data?.session) throw new Error('signIn fail: ' + (error?.message ?? 'no session'))
  if (role) await admin.from('profiles').update({ role }).eq('id', data.session.user.id)
  return { admin, session: data.session, cookie: ssrCookie(url, data.session) }
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

async function catalogItem(productId, extra = '') {
  const suffix = extra ? `&${extra}` : ''
  const cat = await api('GET', `/api/products?q=${TOKEN}&page_size=48${suffix}`, null)
  return (cat.body?.data?.items ?? []).find((item) => item.id === productId) ?? null
}

function testBody(slug, title) {
  return {
    slug, title, type: 'reading', is_free: true, difficulty: 5, duration_sec: 3600, question_types: ['gap_filling'],
    passages: [{ id: 'p1', number: 1, title: 'P', content: 'Passage content.' }],
    questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'gap_filling', instruction: 'ONE WORD', points: 1 }],
    answer_keys: { q1: { type: 'gap_filling', answers: ['hopper'], match: 'ci', points: 1 } },
  }
}
const PRODUCT_BODY = {
  slug: P_SLUG, title: `[W13] Product Smoke ${TOKEN}`, description: 'Smoke bundle', kind: 'bundle', price_coins: 120, sort_order: 1,
}

const run = async () => {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) { console.log('SKIP: thiếu env Supabase'); return finish() }

  const ADMIN = await signIn(url, anon, service, 'w13-admin@test.dev', 'admin')
  const USER = await signIn(url, anon, service, 'w13-user@test.dev', 'user')

  // clean previous smoke data (cascade collection_tests), refresh matview để bỏ product cũ
  await ADMIN.admin.from('products').delete().like('slug', 'w13-smoke%')
  await ADMIN.admin.from('tests').delete().like('slug', 'w13-smoke%')
  try { await ADMIN.admin.rpc('refresh_product_search') } catch { /* matview refresh best-effort in cleanup */ }

  // Seed 2 tests qua admin API (W12): 1 published + 1 draft (để kiểm tra draft KHÔNG lộ qua bundle)
  const pubT = await api('POST', '/api/admin/tests', ADMIN.cookie, testBody('w13-smoke-pub-test', '[W13] Pub Test'))
  const pubTestId = pubT.body?.data?.test_id
  await api('POST', `/api/admin/tests/${pubTestId}/publish`, ADMIN.cookie)
  const draftT = await api('POST', '/api/admin/tests', ADMIN.cookie, testBody('w13-smoke-draft-test', '[W13] Draft Test'))
  const draftTestId = draftT.body?.data?.test_id
  check('seed: pub test + draft test tạo được', !!pubTestId && !!draftTestId, `${pubT.status}/${draftT.status}`)

  // 1) Guard: unauth + non-admin
  check('unauth POST /api/admin/products → 401', (await api('POST', '/api/admin/products', null, PRODUCT_BODY)).status === 401)
  const naCreate = await api('POST', '/api/admin/products', USER.cookie, PRODUCT_BODY)
  check('non-admin POST products → 403 FORBIDDEN', naCreate.status === 403 && naCreate.body?.meta?.error_code === 'FORBIDDEN', `got ${naCreate.status}`)
  check('unauth GET /api/admin/products → 401', (await api('GET', '/api/admin/products', null)).status === 401)
  check('non-admin GET admin products → 403', (await api('GET', '/api/admin/products', USER.cookie)).status === 403)

  // 2) Admin create product → draft
  const cr = await api('POST', '/api/admin/products', ADMIN.cookie, PRODUCT_BODY)
  check('admin create product → 201', cr.status === 201, `got ${cr.status} ${JSON.stringify(cr.body?.meta)}`)
  const productId = cr.body?.data?.product_id
  check('create trả product_id + status=draft', !!productId && cr.body?.data?.status === 'draft')
  for (const s of SECRET) check(`create response KHÔNG lộ "${s}"`, !jsonHas(cr.body, s))

  // 3) Invalid input → 400
  check('giá âm → 400', (await api('POST', '/api/admin/products', ADMIN.cookie, { ...PRODUCT_BODY, slug: 'w13-smoke-neg', price_coins: -5 })).status === 400)
  check('slug trùng → 400', (await api('POST', '/api/admin/products', ADMIN.cookie, PRODUCT_BODY)).status === 400)
  check('kind sai → 400', (await api('POST', '/api/admin/products', ADMIN.cookie, { ...PRODUCT_BODY, slug: 'w13-smoke-kind', kind: 'megapack' })).status === 400)
  check('slug sai format → 400', (await api('POST', '/api/admin/products', ADMIN.cookie, { ...PRODUCT_BODY, slug: 'W13 Smoke Bad Slug' })).status === 400)

  // 4) PATCH update giá (server-authoritative)
  const pa = await api('PATCH', '/api/admin/products', ADMIN.cookie, { ...PRODUCT_BODY, id: productId, price_coins: 200 })
  check('admin PATCH product giá → 200', pa.status === 200, `got ${pa.status}`)
  const { data: prow } = await ADMIN.admin.from('products').select('price_coins, status').eq('id', productId).single()
  check('DB price_coins = 200 (server ghi)', prow?.price_coins === 200)

  // 5) List admin BAO cả draft
  const list = await api('GET', '/api/admin/products', ADMIN.cookie)
  const listed = (list.body?.data?.items ?? []).find((i) => i.id === productId)
  check('admin list chứa product (incl draft)', !!listed && listed.status === 'draft', JSON.stringify(listed))

  // 6) Bind tests vào bundle (idempotent)
  const b1 = await api('POST', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId, position: 1 })
  check('bind pub test → 201', b1.status === 201, `got ${b1.status}`)
  const b1again = await api('POST', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId, position: 3 })
  check('bind lại pub test (idempotent upsert) → 201', b1again.status === 201, `got ${b1again.status}`)
  const { count: dupCount } = await ADMIN.admin.from('collection_tests').select('*', { count: 'exact', head: true }).eq('product_id', productId).eq('test_id', pubTestId)
  check('collection_tests KHÔNG nhân đôi (idempotent)', dupCount === 1, `count=${dupCount}`)
  const b2 = await api('POST', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: draftTestId, position: 2 })
  check('bind draft test → 201', b2.status === 201, `got ${b2.status}`)
  check('bind test không tồn tại → 400', (await api('POST', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: '00000000-0000-0000-0000-0000000000ff', position: 1 })).status === 400)
  check('bind vào product không tồn tại → 404', (await api('POST', `/api/admin/products/00000000-0000-0000-0000-0000000000ee/tests`, ADMIN.cookie, { test_id: pubTestId })).status === 404)
  check('non-admin bind → 403', (await api('POST', `/api/admin/products/${productId}/tests`, USER.cookie, { test_id: pubTestId })).status === 403)

  // 7) Published-only: product CÒN draft → public detail 404, catalog KHÔNG có
  check('public GET /api/products/<slug> (draft) → 404', (await api('GET', `/api/products/${P_SLUG}`, null)).status === 404)
  const catDraft = await api('GET', `/api/products?q=${TOKEN}`, null)
  check('catalog (draft) KHÔNG chứa product', !(catDraft.body?.data?.items ?? []).some((i) => i.id === productId))

  // 8) Publish product → published + refresh product_search
  check('publish product không tồn tại → 404', (await api('POST', `/api/admin/products/00000000-0000-0000-0000-0000000000ee/publish`, ADMIN.cookie)).status === 404)
  check('non-admin publish → 403', (await api('POST', `/api/admin/products/${productId}/publish`, USER.cookie)).status === 403)
  const pub = await api('POST', `/api/admin/products/${productId}/publish`, ADMIN.cookie)
  check('admin publish → 200 status=published', pub.status === 200 && pub.body?.data?.status === 'published', `got ${pub.status}`)

  // 9) Public catalog + detail sau publish: hiện published, draft test KHÔNG lộ qua bundle, no-leak
  const cat = await api('GET', `/api/products?q=${TOKEN}`, null)
  check('catalog (published) CHỨA product (product_search refreshed)', (cat.body?.data?.items ?? []).some((i) => i.id === productId), JSON.stringify(cat.body?.data?.pagination))
  const det = await api('GET', `/api/products/${P_SLUG}`, null)
  check('public detail → 200', det.status === 200, `got ${det.status}`)
  const detTestIds = (det.body?.data?.tests ?? []).map((t) => t.id)
  check('mục lục public chứa PUB test', detTestIds.includes(pubTestId))
  check('mục lục public KHÔNG lộ DRAFT test (collection_tests published-only)', !detTestIds.includes(draftTestId), JSON.stringify(detTestIds))
  for (const s of SECRET) check(`public detail KHÔNG lộ "${s}"`, !jsonHas(det.body, s))

  // 10) Admin detail metadata-only (no exam payload leak)
  const adDet = await api('GET', `/api/admin/products/${productId}`, ADMIN.cookie)
  check('admin detail → 200 + bound tests', adDet.status === 200 && (adDet.body?.data?.tests?.length ?? 0) === 2, `got ${adDet.status} tests=${adDet.body?.data?.tests?.length}`)
  for (const s of ['passages', 'questions', 'answer_keys', ANSWER_SECRET]) check(`admin detail KHÔNG lộ "${s}"`, !jsonHas(adDet.body, s))
  check('non-admin admin-detail → 403', (await api('GET', `/api/admin/products/${productId}`, USER.cookie)).status === 403)

  // 11) Regression VOL 09: product đã published rồi mới đổi mục lục/lifecycle test.
  // Đây là thứ tự từng làm product hiện ở All nhưng mất khỏi filter Reading vì matview stale.
  const publishedPatch = await api('PATCH', '/api/admin/products', ADMIN.cookie, {
    ...PRODUCT_BODY, id: productId, price_coins: 210,
  })
  check('PATCH product published → 200 + refresh', publishedPatch.status === 200, `got ${publishedPatch.status}`)
  check('catalog thấy price mới ngay', (await catalogItem(productId))?.price_coins === 210)

  const unbindPub = await api('DELETE', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId })
  check('unbind Reading khỏi product published → removed=true', unbindPub.status === 200 && unbindPub.body?.data?.removed === true)
  check('All vẫn có product khi chỉ còn draft test', !!(await catalogItem(productId)))
  check('Reading không có product khi skills=[]', !(await catalogItem(productId, 'skill=reading')))

  const publishBoundDraft = await api('POST', `/api/admin/tests/${draftTestId}/publish`, ADMIN.cookie)
  check('publish bound draft Reading → 200', publishBoundDraft.status === 200, `got ${publishBoundDraft.status}`)
  check('Reading xuất hiện ngay sau publish test', !!(await catalogItem(productId, 'skill=reading')))

  const updateBody = (type) => ({
    ...testBody('w13-smoke-draft-test', '[W13] Draft Test'),
    id: draftTestId,
    type,
    question_types: type === 'writing' ? ['essay'] : ['gap_filling'],
  })
  const toListening = await api('PATCH', '/api/admin/tests', ADMIN.cookie, updateBody('listening'))
  check('đổi published test Reading→Listening → 200', toListening.status === 200, `got ${toListening.status}`)
  check('Reading biến mất sau đổi type', !(await catalogItem(productId, 'skill=reading')))
  check('Listening xuất hiện sau đổi type', !!(await catalogItem(productId, 'skill=listening')))

  const toWriting = await api('PATCH', '/api/admin/tests', ADMIN.cookie, updateBody('writing'))
  check('đổi Listening→Writing → 200', toWriting.status === 200, `got ${toWriting.status}`)
  check('Listening biến mất sau đổi type', !(await catalogItem(productId, 'skill=listening')))
  check('Writing xuất hiện sau đổi type', !!(await catalogItem(productId, 'skill=writing')))

  const noFree = await api('PATCH', `/api/admin/tests/${draftTestId}`, ADMIN.cookie, { is_free: false })
  check('toggle is_free published test → 200', noFree.status === 200, `got ${noFree.status}`)
  check('free filter cập nhật ngay', !(await catalogItem(productId, 'free=1')))

  const hideWriting = await api('DELETE', `/api/admin/tests/${draftTestId}`, ADMIN.cookie)
  check('hide published Writing test → hidden', hideWriting.status === 200 && hideWriting.body?.data?.action === 'hidden')
  check('Writing biến mất sau hide', !(await catalogItem(productId, 'skill=writing')))
  check('All vẫn có published product sau hide', !!(await catalogItem(productId)))

  const bindPublishedReading = await api('POST', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId, position: 1 })
  check('bind Reading vào product đã published → 201', bindPublishedReading.status === 201, `got ${bindPublishedReading.status}`)
  check('VOL xuất hiện ngay dưới Reading sau bind', !!(await catalogItem(productId, 'skill=reading')))
  check('VOL không lọt Listening/Writing', !(await catalogItem(productId, 'skill=listening')) && !(await catalogItem(productId, 'skill=writing')))

  const unbindAgain = await api('DELETE', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId })
  check('unbind Reading lần nữa → removed=true', unbindAgain.status === 200 && unbindAgain.body?.data?.removed === true)
  check('Reading biến mất ngay sau unbind', !(await catalogItem(productId, 'skill=reading')))
  const unbindRetry = await api('DELETE', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId })
  check('retry unbind idempotent → removed=false + vẫn refresh', unbindRetry.status === 200 && unbindRetry.body?.data?.removed === false)

  const restoreReading = await api('POST', `/api/admin/products/${productId}/tests`, ADMIN.cookie, { test_id: pubTestId, position: 1 })
  check('restore Reading fixture → 201', restoreReading.status === 201, `got ${restoreReading.status}`)
  check('Reading xuất hiện lại sau restore', !!(await catalogItem(productId, 'skill=reading')))

  finish()
}

function finish() {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
