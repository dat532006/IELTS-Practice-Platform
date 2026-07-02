// W3 runtime smoke for GET /api/products (run against `next start`/`next dev` + local Supabase).
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node --env-file=.env.local supabase/smoke/catalog_smoke.mjs
//
// Tự nạp fixture (tương đương catalog_fixtures.sql, idempotent — on_conflict do nothing)
// bằng service role rồi gọi RPC refresh_product_search. LOCAL ONLY — không chạy trên prod.
//
// Assertion theo fixture (contains/excludes/thứ tự tương đối) — KHÔNG giả định DB chỉ có
// fixture: dev DB còn seed VOL + dữ liệu leftover của các smoke khác (vd w15-smoke-p*).
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000'
const PAYLOAD_KEYS = ['passages', 'questions', 'answer_keys', 'answers', 'keys', 'audio', 'audio_url']

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA || !SERVICE) {
  console.error('SMOKE ERROR: cần NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (chạy với --env-file=.env.local)')
  process.exit(2)
}

// ---- fixtures (giữ khớp catalog_fixtures.sql) -----------------
const T_LISTEN = 'a1111111-1111-1111-1111-111111111111'
const T_WRITE = 'b2222222-2222-2222-2222-222222222222'
const T_DRAFT = 'c3333333-3333-3333-3333-333333333333'
const P_FREE = 'd4444444-4444-4444-4444-444444444444'
const P_HOT = 'e5555555-5555-5555-5555-555555555555'
const P_DRAFT = 'f6666666-6666-6666-6666-666666666666'
const P_HIDDEN = '07777777-7777-7777-7777-777777777777'

const FIXTURE_TESTS = [
  { id: T_LISTEN, slug: 'smoke-listening-free', title: 'Smoke Listening Free', type: 'listening', source: 'Tự soạn', is_free: true, difficulty: 1, question_types: ['mcq', 'map_labelling'], attempts_count: 7, status: 'published', passages: [{ id: 'p1', number: 1, title: 'L', content: 'x' }], questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'mcq', instruction: 'i', points: 1 }] },
  { id: T_WRITE, slug: 'smoke-writing-paid', title: 'Smoke Writing Paid', type: 'writing', source: 'Tự soạn', is_free: false, difficulty: 4, question_types: ['essay'], attempts_count: 99, status: 'published', passages: [{ id: 'p1', number: 1, title: 'W', content: 'x' }], questions: [{ id: 'q1', passage_id: 'p1', number: 1, type: 'essay', instruction: 'i', points: 1 }] },
  { id: T_DRAFT, slug: 'smoke-draft-test', title: 'Smoke Draft Test', type: 'reading', source: 'Tự soạn', is_free: true, difficulty: 2, question_types: ['tfng'], attempts_count: 3, status: 'draft', passages: [], questions: [] },
]
const FIXTURE_PRODUCTS = [
  { id: P_FREE, slug: 'smoke-listening-free-vol', title: 'SMOKE LISTENING FREE VOL', description: 'free listening bundle', kind: 'bundle', price_coins: 0, status: 'published', sort_order: 5 },
  { id: P_HOT, slug: 'smoke-writing-hot-vol', title: 'SMOKE WRITING HOT VOL', description: 'hot writing bundle', kind: 'bundle', price_coins: 300, status: 'published', sort_order: 3 },
  { id: P_DRAFT, slug: 'smoke-draft-vol', title: 'SMOKE DRAFT VOL', description: 'draft bundle', kind: 'bundle', price_coins: 150, status: 'draft', sort_order: 2 },
  { id: P_HIDDEN, slug: 'smoke-hidden-vol', title: 'SMOKE HIDDEN VOL', description: 'hidden bundle', kind: 'bundle', price_coins: 120, status: 'hidden', sort_order: 4 },
]
const FIXTURE_LINKS = [
  { product_id: P_FREE, test_id: T_LISTEN, position: 1 },
  { product_id: P_HOT, test_id: T_WRITE, position: 1 },
  { product_id: P_DRAFT, test_id: T_DRAFT, position: 1 },
  { product_id: P_HIDDEN, test_id: T_WRITE, position: 1 },
]

async function serviceInsert(table, rows, onConflict) {
  const r = await fetch(`${SUPA}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error(`fixture insert ${table} → ${r.status}: ${await r.text()}`)
}

async function loadFixtures() {
  await serviceInsert('tests', FIXTURE_TESTS, 'slug')
  await serviceInsert('products', FIXTURE_PRODUCTS, 'slug')
  await serviceInsert('collection_tests', FIXTURE_LINKS, 'product_id,test_id')
  const r = await fetch(`${SUPA}/rest/v1/rpc/refresh_product_search`, {
    method: 'POST',
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) throw new Error(`refresh_product_search → ${r.status}: ${await r.text()}`)
}

// ---- checks ---------------------------------------------------
let pass = 0, fail = 0
const results = []
function check(name, cond, extra) {
  if (cond) { pass++; results.push(`  ✅ ${name}`) }
  else { fail++; results.push(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}
async function get(qs) {
  const url = `${BASE}/api/products${qs ? '?' + qs : ''}`
  const r = await fetch(url)
  const body = await r.json()
  return { status: r.status, body }
}
const slugs = (b) => (b.data?.items ?? []).map((i) => i.slug)

const run = async () => {
  await loadFixtures()

  // 1) Default list — envelope
  {
    const { status, body } = await get('')
    check('200 OK', status === 200, `got ${status}`)
    check('success=true', body.success === true)
    check('envelope: data.items is array', Array.isArray(body.data?.items))
    check('envelope: pagination present', !!body.data?.pagination)
    check('default page=1', body.data?.pagination?.page === 1, JSON.stringify(body.data?.pagination))
    check('default page_size=12', body.data?.pagination?.page_size === 12)
  }

  // 2) Full list (page_size=48) — published-only + no payload + is_free badge
  let total = 0
  {
    const { body } = await get('page_size=48')
    total = body.data?.pagination?.total ?? 0
    const s = new Set(slugs(body))
    check('contains reading-vol-1 (seed)', s.has('reading-vol-1'), slugs(body).join(','))
    check('contains smoke-listening-free-vol', s.has('smoke-listening-free-vol'))
    check('contains smoke-writing-hot-vol', s.has('smoke-writing-hot-vol'))
    check('EXCLUDES draft product', !s.has('smoke-draft-vol'))
    check('EXCLUDES hidden product', !s.has('smoke-hidden-vol'))
    const leaks = []
    for (const it of body.data?.items ?? []) {
      for (const k of PAYLOAD_KEYS) if (k in it) leaks.push(`${it.slug}.${k}`)
    }
    check('NO exam payload in items', leaks.length === 0, leaks.join(','))
    const byslug = Object.fromEntries((body.data?.items ?? []).map((i) => [i.slug, i]))
    check('is_free badge: free vol = true', byslug['smoke-listening-free-vol']?.is_free === true)
    check('is_free badge: paid vol = false', byslug['smoke-writing-hot-vol']?.is_free === false)
  }

  // 3) free filter (has_free_test)
  {
    const { body } = await get('free=1&page_size=48')
    const s = new Set(slugs(body))
    check('free=1 → contains listening-free-vol', s.has('smoke-listening-free-vol'), slugs(body).join(','))
    check('free=1 → EXCLUDES writing-hot-vol (no free test)', !s.has('smoke-writing-hot-vol'))
  }

  // 4) skill filters
  {
    const w = await get('skill=writing&page_size=48')
    const ws = new Set(slugs(w.body))
    check('skill=writing → contains writing-hot-vol', ws.has('smoke-writing-hot-vol'), slugs(w.body).join(','))
    check('skill=writing → EXCLUDES listening-free-vol', !ws.has('smoke-listening-free-vol'))
    const l = await get('skill=listening&page_size=48')
    const ls = new Set(slugs(l.body))
    check('skill=listening → contains listening-free-vol', ls.has('smoke-listening-free-vol'), slugs(l.body).join(','))
    check('skill=listening → EXCLUDES writing-hot-vol', !ls.has('smoke-writing-hot-vol'))
    const r = await get('skill=reading&page_size=48')
    const rs = new Set(slugs(r.body))
    check('skill=reading → contains reading-vol-1', rs.has('reading-vol-1'), slugs(r.body).join(','))
    check('skill=reading → EXCLUDES writing-hot-vol + listening-free-vol', !rs.has('smoke-writing-hot-vol') && !rs.has('smoke-listening-free-vol'))
  }

  // 5) qtype + difficulty filters
  {
    const q = await get('qtype=essay&page_size=48')
    const qsSet = new Set(slugs(q.body))
    check('qtype=essay → contains writing-hot-vol', qsSet.has('smoke-writing-hot-vol'), slugs(q.body).join(','))
    check('qtype=essay → EXCLUDES listening-free-vol', !qsSet.has('smoke-listening-free-vol'))
    const d = await get('difficulty=4&page_size=48')
    const ds = new Set(slugs(d.body))
    check('difficulty=4 → contains writing-hot-vol', ds.has('smoke-writing-hot-vol'), slugs(d.body).join(','))
    check('difficulty=4 → EXCLUDES listening-free-vol (difficulty 1)', !ds.has('smoke-listening-free-vol'))
  }

  // 6) q (ilike title)
  {
    const { body } = await get('q=writing&page_size=48')
    check('q=writing → contains writing-hot-vol', slugs(body).includes('smoke-writing-hot-vol'), slugs(body).join(','))
  }

  // 7) sort=hot → attempts_total descending + fixture rank tương đối
  {
    const { body } = await get('sort=hot&page_size=48')
    const list = slugs(body)
    const att = (body.data?.items ?? []).map((i) => i.attempts_total)
    const sorted = [...att].sort((a, b) => b - a)
    check('sort=hot → attempts_total descending', JSON.stringify(att) === JSON.stringify(sorted), att.join(','))
    const iHot = list.indexOf('smoke-writing-hot-vol'), iFree = list.indexOf('smoke-listening-free-vol')
    check('sort=hot → writing-hot-vol (99) đứng trước listening-free-vol (7)', iHot !== -1 && iFree !== -1 && iHot < iFree, `hot@${iHot} free@${iFree}`)
  }

  // 8) pagination nhất quán với total thật
  {
    check('total ≥ 3 (seed + fixtures published)', total >= 3, `total=${total}`)
    const { body } = await get('page_size=2')
    check('page_size=2 → 2 items', (body.data?.items ?? []).length === 2)
    const tp = body.data?.pagination?.total_pages
    check('page_size=2 → total_pages=ceil(total/2)', tp === Math.ceil(total / 2), `tp=${tp} total=${total}`)
  }

  // 9) clamp warnings (real boundary behavior)
  {
    const ps = await get('page_size=999')
    check('page_size=999 → clamped to 48', ps.body.data?.pagination?.page_size === 48, `ps=${ps.body.data?.pagination?.page_size}`)
    check('page_size clamp warning present', (ps.body.meta?.warnings ?? []).some((w) => w.includes('page_size') && w.includes('48')), JSON.stringify(ps.body.meta?.warnings))
    const pg = await get('page=99999')
    check('page=99999 → clamped to last page', pg.body.data?.pagination?.page === pg.body.data?.pagination?.total_pages, `p=${pg.body.data?.pagination?.page}`)
    check('page clamp warning present', (pg.body.meta?.warnings ?? []).some((w) => w.includes('page')), JSON.stringify(pg.body.meta?.warnings))
  }

  console.log(`\n=== /api/products runtime smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}
run().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 2 })
