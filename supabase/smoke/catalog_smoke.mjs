// W3 runtime smoke for GET /api/products (run against `next dev` + local Supabase).
// Usage: SMOKE_BASE=http://127.0.0.1:3000 node supabase/smoke/catalog_smoke.mjs
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000'
const PAYLOAD_KEYS = ['passages', 'questions', 'answer_keys', 'answers', 'keys', 'audio', 'audio_url']

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
  // 1) Default list — envelope + published-only + no payload
  {
    const { status, body } = await get('')
    check('200 OK', status === 200, `got ${status}`)
    check('success=true', body.success === true)
    check('envelope: data.items is array', Array.isArray(body.data?.items))
    check('envelope: pagination present', !!body.data?.pagination)
    check('default page=1', body.data?.pagination?.page === 1, JSON.stringify(body.data?.pagination))
    check('default page_size=12', body.data?.pagination?.page_size === 12)
    check('published-only: total=3', body.data?.pagination?.total === 3, `total=${body.data?.pagination?.total} slugs=${slugs(body)}`)
    const s = new Set(slugs(body))
    check('contains reading-vol-1', s.has('reading-vol-1'))
    check('contains smoke-listening-free-vol', s.has('smoke-listening-free-vol'))
    check('contains smoke-writing-hot-vol', s.has('smoke-writing-hot-vol'))
    check('EXCLUDES draft product', !s.has('smoke-draft-vol'))
    check('EXCLUDES hidden product', !s.has('smoke-hidden-vol'))
    // no payload leakage
    const leaks = []
    for (const it of body.data?.items ?? []) {
      for (const k of PAYLOAD_KEYS) if (k in it) leaks.push(`${it.slug}.${k}`)
    }
    check('NO exam payload in items', leaks.length === 0, leaks.join(','))
    // is_free badge
    const byslug = Object.fromEntries((body.data?.items ?? []).map((i) => [i.slug, i]))
    check('is_free badge: free vol = true', byslug['smoke-listening-free-vol']?.is_free === true)
    check('is_free badge: paid vol = false', byslug['smoke-writing-hot-vol']?.is_free === false)
  }

  // 2) free filter (has_free_test)
  {
    const { body } = await get('free=1')
    check('free=1 → only listening-free-vol', JSON.stringify(slugs(body)) === JSON.stringify(['smoke-listening-free-vol']), slugs(body).join(','))
  }

  // 3) skill filters
  {
    const w = await get('skill=writing')
    check('skill=writing → only writing-hot-vol', JSON.stringify(slugs(w.body)) === JSON.stringify(['smoke-writing-hot-vol']), slugs(w.body).join(','))
    const l = await get('skill=listening')
    check('skill=listening → only listening-free-vol', JSON.stringify(slugs(l.body)) === JSON.stringify(['smoke-listening-free-vol']), slugs(l.body).join(','))
    const r = await get('skill=reading')
    check('skill=reading → only reading-vol-1', JSON.stringify(slugs(r.body)) === JSON.stringify(['reading-vol-1']), slugs(r.body).join(','))
  }

  // 4) qtype + difficulty filters
  {
    const q = await get('qtype=essay')
    check('qtype=essay → only writing-hot-vol', JSON.stringify(slugs(q.body)) === JSON.stringify(['smoke-writing-hot-vol']), slugs(q.body).join(','))
    const d = await get('difficulty=4')
    check('difficulty=4 → only writing-hot-vol', JSON.stringify(slugs(d.body)) === JSON.stringify(['smoke-writing-hot-vol']), slugs(d.body).join(','))
  }

  // 5) q (ilike title)
  {
    const { body } = await get('q=writing')
    check('q=writing → contains writing-hot-vol', slugs(body).includes('smoke-writing-hot-vol'), slugs(body).join(','))
  }

  // 6) sort=hot → highest attempts first
  {
    const { body } = await get('sort=hot')
    check('sort=hot → writing-hot-vol first', slugs(body)[0] === 'smoke-writing-hot-vol', slugs(body).join(','))
    const att = (body.data?.items ?? []).map((i) => i.attempts_total)
    const sorted = [...att].sort((a, b) => b - a)
    check('sort=hot → attempts_total descending', JSON.stringify(att) === JSON.stringify(sorted), att.join(','))
  }

  // 7) pagination
  {
    const { body } = await get('page_size=2')
    check('page_size=2 → 2 items', (body.data?.items ?? []).length === 2)
    check('page_size=2 → total_pages=2', body.data?.pagination?.total_pages === 2, `tp=${body.data?.pagination?.total_pages}`)
  }

  // 8) clamp warnings (real boundary behavior)
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
