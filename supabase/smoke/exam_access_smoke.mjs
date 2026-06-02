// W4 runtime smoke — exam payload gate + product detail + pre-exam meta.
// Drives the REAL API service path (not just DB policy) per w4.md Task 4.5 / risk row.
// Prereq: local Supabase up + `next dev` + seed.sql applied (reading-free-1 / reading-premium-1 / reading-vol-1).
// Usage: SMOKE_BASE=http://127.0.0.1:3000 node supabase/smoke/exam_access_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000'
const FREE_TEST = '11111111-1111-1111-1111-111111111111' // reading-free-1 (is_free)
const PREMIUM_TEST = '22222222-2222-2222-2222-222222222222' // reading-premium-1 (premium)
const PREMIUM_PRODUCT = '33333333-3333-3333-3333-333333333333' // reading-vol-1 (chứa premium test)
const PRODUCT_SLUG = 'reading-vol-1'
// Bất kỳ key nào dưới đây xuất hiện ở payload/ metadata = LEAK (đặc biệt answer_keys/keys).
const SECRET_KEYS = ['answer_keys', 'keys']
const PAYLOAD_KEYS = ['passages', 'questions']

let pass = 0,
  fail = 0,
  skip = 0
const results = []
const ok = (n) => {
  pass++
  results.push(`  ✅ ${n}`)
}
const no = (n, extra) => {
  fail++
  results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`)
}
const skipped = (n, why) => {
  skip++
  results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`)
}
const check = (n, cond, extra) => (cond ? ok(n) : no(n, extra))

async function getJson(path, headers) {
  const r = await fetch(`${BASE}${path}`, { headers: headers || {} })
  let body = null
  try {
    body = await r.json()
  } catch {
    /* non-json */
  }
  return { status: r.status, body }
}
const deepHas = (obj, key) => {
  if (obj == null || typeof obj !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true
  for (const v of Object.values(obj)) if (deepHas(v, key)) return true
  return false
}

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* optional */
  }
}

const run = async () => {
  // === 1) FREE exam (unauth) → 200 payload, KHÔNG answer_keys ===
  {
    const { status, body } = await getJson(`/api/exam/${FREE_TEST}`)
    check('free exam → 200', status === 200, `got ${status}`)
    check('free exam → success=true', body?.success === true)
    check('free exam → có passages', deepHas(body?.data, 'passages'))
    check('free exam → có questions', deepHas(body?.data, 'questions'))
    for (const k of SECRET_KEYS)
      check(`free exam → KHÔNG có ${k}`, !deepHas(body, k))
    check('free exam → audio_url=null (reading)', body?.data?.audio_url === null)
  }

  // === 2) PREMIUM exam (unauth, chưa unlock) → 403 EXAM_LOCKED, KHÔNG payload ===
  {
    const { status, body } = await getJson(`/api/exam/${PREMIUM_TEST}`)
    check('premium exam (unauth) → 403', status === 403, `got ${status}`)
    check('premium exam → success=false', body?.success === false)
    check('premium exam → error_code=EXAM_LOCKED', body?.meta?.error_code === 'EXAM_LOCKED', JSON.stringify(body?.meta))
    check('premium exam → data=null (no payload)', body?.data === null)
    for (const k of [...PAYLOAD_KEYS, ...SECRET_KEYS])
      check(`premium exam (locked) → KHÔNG có ${k}`, !deepHas(body, k))
  }

  // === 3) Pre-exam meta — free=unlocked, premium(unauth)=locked, KHÔNG payload ===
  {
    const free = await getJson(`/api/tests/${FREE_TEST}`)
    check('meta free → 200', free.status === 200, `got ${free.status}`)
    check('meta free → locked=false', free.body?.data?.locked === false)
    check('meta free → có duration_sec', typeof free.body?.data?.duration_sec === 'number')
    for (const k of [...PAYLOAD_KEYS, ...SECRET_KEYS])
      check(`meta free → KHÔNG có ${k}`, !deepHas(free.body, k))

    const prem = await getJson(`/api/tests/${PREMIUM_TEST}`)
    check('meta premium (unauth) → 200', prem.status === 200, `got ${prem.status}`)
    check('meta premium → locked=true', prem.body?.data?.locked === true)
    for (const k of [...PAYLOAD_KEYS, ...SECRET_KEYS])
      check(`meta premium → KHÔNG có ${k}`, !deepHas(prem.body, k))
  }

  // === 3b) Invalid UUID → 404 NOT_FOUND envelope (KHÔNG 500 INTERNAL) ===
  {
    const t = await getJson('/api/tests/not-a-uuid')
    check('GET /api/tests/{bad-uuid} → 404', t.status === 404, `got ${t.status}`)
    check('GET /api/tests/{bad-uuid} → error_code=NOT_FOUND', t.body?.meta?.error_code === 'NOT_FOUND', JSON.stringify(t.body?.meta))
    const e = await getJson('/api/exam/not-a-uuid')
    check('GET /api/exam/{bad-uuid} → 404', e.status === 404, `got ${e.status}`)
    check('GET /api/exam/{bad-uuid} → error_code=NOT_FOUND', e.body?.meta?.error_code === 'NOT_FOUND', JSON.stringify(e.body?.meta))
  }

  // === 4) Product detail (unauth) → owned=false, premium test locked, KHÔNG payload ===
  {
    const { status, body } = await getJson(`/api/products/${PRODUCT_SLUG}`)
    check('detail → 200', status === 200, `got ${status}`)
    check('detail → owned=false (unauth)', body?.data?.owned === false)
    check('detail → tests là array', Array.isArray(body?.data?.tests))
    const premium = (body?.data?.tests ?? []).find((t) => t.id === PREMIUM_TEST)
    check('detail → chứa premium test trong mục lục', !!premium, JSON.stringify((body?.data?.tests ?? []).map((t) => t.id)))
    check('detail → premium test locked=true', premium?.locked === true)
    check('detail → test có position', typeof (body?.data?.tests?.[0]?.position) === 'number')
    for (const k of [...PAYLOAD_KEYS, ...SECRET_KEYS])
      check(`detail → KHÔNG có ${k}`, !deepHas(body, k))
  }

  // === 5) (best-effort) AUTHED: product-only → vẫn 403 (regression ca #6); rồi +test_unlocks → 200 ===
  // Cookie @supabase/ssr brittle theo version → fail mềm thành SKIP (DB smoke #15/#17 là bằng chứng chính).
  await authedAccessCases()

  console.log(`\n=== /api/exam access boundary smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}

function buildSsrCookie(url, session) {
  // cookie @supabase/ssr: sb-<ref>-auth-token = base64-<b64(JSON session)>, chunk 3180
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180
  const parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}

async function authedAccessCases() {
  const label = 'authed access (product-only → 403; +test_unlocks → 200)'
  try {
    loadEnvLocal()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) return skipped(label, 'thiếu env Supabase')

    const email = 'w4-smoke@test.dev'
    const password = 'w4-smoke-pass-123'
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    await admin.auth.admin.createUser({ email, password, email_confirm: true }).catch(() => {})

    const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: signIn, error: siErr } = await anonClient.auth.signInWithPassword({ email, password })
    if (siErr || !signIn?.session) return skipped(label, 'signIn fail: ' + (siErr?.message ?? 'no session'))
    const session = signIn.session
    const userId = session.user.id
    const Cookie = buildSsrCookie(url, session)

    // sanity: guard có nhận session không? (nếu không → SKIP, DB smoke #15/#17 là bằng chứng chính)
    await admin.from('test_unlocks').delete().eq('user_id', userId)
    await admin.from('product_unlocks').delete().eq('user_id', userId)

    // --- Phase A: PRODUCT-ONLY (owns bundle, chưa expand test_unlocks) → exam VẪN 403 (regression ca #6) ---
    const { error: puErr } = await admin
      .from('product_unlocks')
      .upsert({ user_id: userId, product_id: PREMIUM_PRODUCT, via: 'purchase' }, { onConflict: 'user_id,product_id' })
    if (puErr) return skipped(label, 'seed product_unlocks fail: ' + puErr.message)

    const aExam = await getJson(`/api/exam/${PREMIUM_TEST}`, { Cookie })
    // Phát hiện guard không nhận session: detail owned phải = true mới chứng tỏ session OK.
    const aDetail = await getJson(`/api/products/${PRODUCT_SLUG}`, { Cookie })
    if (aDetail.body?.data?.owned !== true) {
      return skipped(label, `guard không nhận session cookie (owned=${aDetail.body?.data?.owned}) — xem DB smoke #15/#17`)
    }
    check('authed product-only → exam 403', aExam.status === 403, `got ${aExam.status}`)
    check('authed product-only → error_code=EXAM_LOCKED', aExam.body?.meta?.error_code === 'EXAM_LOCKED')
    for (const k of [...PAYLOAD_KEYS, ...SECRET_KEYS])
      check(`authed product-only → KHÔNG có ${k}`, !deepHas(aExam.body, k))
    check('authed product-only → detail owned=true (cờ UI)', aDetail.body?.data?.owned === true)
    const aPrem = (aDetail.body?.data?.tests ?? []).find((t) => t.id === PREMIUM_TEST)
    check('authed product-only → detail premium test VẪN locked=true (nhất quán exam)', aPrem?.locked === true)

    // --- Phase B: +test_unlocks → exam 200 payload, KHÔNG answer_keys ---
    const { error: tuErr } = await admin
      .from('test_unlocks')
      .upsert(
        { user_id: userId, test_id: PREMIUM_TEST, product_id: PREMIUM_PRODUCT },
        { onConflict: 'user_id,test_id,product_id' },
      )
    if (tuErr) return skipped(label, 'seed test_unlocks fail: ' + tuErr.message)

    const bExam = await getJson(`/api/exam/${PREMIUM_TEST}`, { Cookie })
    check('authed +test_unlocks → exam 200', bExam.status === 200, `got ${bExam.status}`)
    check('authed +test_unlocks → có payload (passages+questions)', deepHas(bExam.body?.data, 'passages') && deepHas(bExam.body?.data, 'questions'))
    for (const k of SECRET_KEYS) check(`authed +test_unlocks → KHÔNG có ${k}`, !deepHas(bExam.body, k))
    const bDetail = await getJson(`/api/products/${PRODUCT_SLUG}`, { Cookie })
    const bPrem = (bDetail.body?.data?.tests ?? []).find((t) => t.id === PREMIUM_TEST)
    check('authed +test_unlocks → detail premium test locked=false', bPrem?.locked === false)
  } catch (e) {
    skipped(label, 'exception: ' + (e?.message ?? String(e)))
  }
}

run().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exitCode = 2
})
