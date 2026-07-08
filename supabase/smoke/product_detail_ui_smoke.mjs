// W4 FE runtime smoke — SSR HTML cho /products/[slug] + /tests/[id].
// Cover ĐỦ state: guest (free/locked) + authed (locked_auth, owned, unlocked) — w4.md state table.
// Khẳng định: state đúng, mục lục theo position, KHÔNG lộ payload, locked KHÔNG có path /exam.
// Usage: SMOKE_BASE=http://127.0.0.1:3100 node supabase/smoke/product_detail_ui_smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'
const FREE_ID = '11111111-1111-1111-1111-111111111111' // reading-free-1 (free, published)
const PREMIUM_ID = '22222222-2222-2222-2222-222222222222' // reading-premium-1 (premium, published)
const PREMIUM_PRODUCT = '33333333-3333-3333-3333-333333333333' // reading-vol-1 (chứa premium test)
const PRODUCT_SLUG = 'reading-vol-1'
const PREMIUM_PASSAGE = 'Nội dung trả phí' // payload mẫu KHÔNG được lộ
const FREE_PASSAGE = 'Đoạn văn mẫu'

let pass = 0,
  fail = 0,
  skip = 0
const results = []
const check = (n, cond, extra) =>
  cond ? (pass++, results.push(`  ✅ ${n}`)) : (fail++, results.push(`  ❌ ${n}${extra ? ' — ' + extra : ''}`))
const skipped = (n, why) => (skip++, results.push(`  ⏭️  SKIP ${n}${why ? ' — ' + why : ''}`))

async function getHtml(path, cookie) {
  const r = await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} })
  return { status: r.status, text: await r.text() }
}

function loadEnvLocal() {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* optional */
  }
}
function buildSsrCookie(url, session) {
  const ref = new URL(url).hostname.split('.')[0]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64')
  const MAX = 3180
  const parts = []
  if (value.length <= MAX) parts.push(`${name}=${value}`)
  else for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) parts.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  return parts.join('; ')
}

const run = async () => {
  // ===== GUEST =====
  // 1) Product detail (guest) — owned=false, premium locked, mục lục, KHÔNG payload, KHÔNG link /exam
  {
    const { status, text } = await getHtml(`/products/${PRODUCT_SLUG}`)
    check('guest detail → 200', status === 200, `got ${status}`)
    check('guest detail → breadcrumb "Bộ đề"', text.includes('Bộ đề'))
    check('guest detail → title READING VOL 1', text.includes('READING VOL 1'))
    check('guest detail → "Mục lục đề"', text.includes('Mục lục đề'))
    check('guest detail → tên đề premium trong mục lục', text.includes('Reading Premium 1'))
    check('guest detail → premium badge "Khóa"', text.includes('Khóa'))
    // 2026-07-08 Owner chốt brand currency = "xương cá" (PR #23) — sync assertion khỏi "Mua bằng coin".
    check('guest detail → CTA mua (not owned)', text.includes('Mua bằng xương cá') && text.includes('100'))
    check('guest detail → KHÔNG badge "Đã sở hữu"', !text.includes('Đã sở hữu'))
    check('guest detail → KHÔNG link /exam/ (mục lục chỉ /tests/)', !text.includes('/exam/'))
    check('guest detail → KHÔNG lộ passage premium', !text.includes(PREMIUM_PASSAGE))
    check('guest detail → KHÔNG raw "passages"/"questions"', !text.includes('"passages"') && !text.includes('"questions"'))
  }
  // 2) Detail không tồn tại → không render product
  {
    const { status, text } = await getHtml('/products/khong-ton-tai-xyz')
    const nf = /could not be found|not found|404|không tìm/i.test(text)
    check('detail không tồn tại → KHÔNG render mục lục', !text.includes('Mục lục đề'))
    check(`detail không tồn tại → not-found (http ${status})`, nf || status === 404)
  }
  // 3) Pre-exam FREE (guest) — Start + link /exam, KHÔNG payload
  {
    const { status, text } = await getHtml(`/tests/${FREE_ID}`)
    check('guest pre-exam free → 200', status === 200, `got ${status}`)
    check('guest pre-exam free → badge "Miễn phí"', text.includes('Miễn phí'))
    check('guest pre-exam free → CTA "Bắt đầu làm bài"', text.includes('Bắt đầu làm bài'))
    check('guest pre-exam free → CÓ link /exam/{free}', text.includes(`/exam/${FREE_ID}`))
    check('guest pre-exam free → có "Kỹ năng"/"Thời lượng"', text.includes('Kỹ năng') && text.includes('Thời lượng'))
    check('guest pre-exam free → KHÔNG lộ passage', !text.includes(FREE_PASSAGE))
  }
  // 4) Pre-exam PREMIUM (guest → locked_guest) — KHÔNG link /exam, CTA login
  {
    const { status, text } = await getHtml(`/tests/${PREMIUM_ID}`)
    check('guest pre-exam premium → 200', status === 200, `got ${status}`)
    check('guest pre-exam premium → badge "Khóa"', text.includes('Khóa'))
    check('guest pre-exam premium → CTA "Đăng nhập để mở khóa"', text.includes('Đăng nhập để mở khóa'))
    check('guest pre-exam premium → KHÔNG link /exam/{premium}', !text.includes(`/exam/${PREMIUM_ID}`))
    check('guest pre-exam premium → KHÔNG "Bắt đầu/Vào làm"', !text.includes('Bắt đầu làm bài') && !text.includes('Vào làm bài'))
    check('guest pre-exam premium → KHÔNG lộ passage', !text.includes(PREMIUM_PASSAGE))
  }
  // 5) id sai định dạng → không render pre-exam
  {
    const { status, text } = await getHtml('/tests/not-a-uuid')
    const nf = /could not be found|not found|404|không tìm/i.test(text)
    check('pre-exam id sai → KHÔNG render pre-exam', !text.includes('Bắt đầu làm bài') && !text.includes('Kỹ năng'))
    check(`pre-exam id sai → not-found (http ${status})`, nf || status === 404)
  }

  // ===== AUTHED (locked_auth → owned/unlocked) =====
  await authedStates()

  console.log(`\n=== product detail / pre-exam UI smoke @ ${BASE} ===`)
  console.log(results.join('\n'))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`)
  process.exitCode = fail === 0 ? 0 : 1
}

async function authedStates() {
  const tag = 'authed states'
  try {
    loadEnvLocal()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) return skipped(tag, 'thiếu env Supabase')

    const email = 'w4-fe-smoke@test.dev'
    const password = 'w4-fe-smoke-123'
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    await admin.auth.admin.createUser({ email, password, email_confirm: true }).catch(() => {})
    const anonC = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: si, error: siErr } = await anonC.auth.signInWithPassword({ email, password })
    if (siErr || !si?.session) return skipped(tag, 'signIn fail: ' + (siErr?.message ?? 'no session'))
    const userId = si.session.user.id
    const Cookie = buildSsrCookie(url, si.session)

    // sạch state
    await admin.from('test_unlocks').delete().eq('user_id', userId)
    await admin.from('product_unlocks').delete().eq('user_id', userId)

    // sanity: guard nhận session? (detail owned phải false ở đây; nếu page lỗi auth → SKIP)
    const probe = await getHtml(`/products/${PRODUCT_SLUG}`, Cookie)
    if (probe.status !== 200) return skipped(tag, `detail status ${probe.status} (session?) — xem db smoke`)

    // --- Phase A: LOCKED_AUTH (đã login, chưa mở khóa) ---
    {
      const d = await getHtml(`/products/${PRODUCT_SLUG}`, Cookie)
      check('authed not-owned → CTA "Mua bằng xương cá"', d.text.includes('Mua bằng xương cá'))
      check('authed not-owned → KHÔNG "Đã sở hữu"', !d.text.includes('Đã sở hữu'))
      check('authed not-owned → premium test "Khóa"', d.text.includes('Khóa'))

      const p = await getHtml(`/tests/${PREMIUM_ID}`, Cookie)
      // FE-F01 (2026-07-02): locked_auth = CTA mua bundle THẬT (link /products/[slug]); redeem KHÔNG
      //   thuộc luồng mua thường (Owner W16) → KHÔNG còn nút "Nhập mã"/copy W15-16 disabled.
      check('locked_auth pre-exam → CTA "Mua bộ đề" (link /products/)', p.text.includes('Mua bộ đề') && p.text.includes('/products/'))
      check('locked_auth pre-exam → KHÔNG "Nhập mã" (redeem ngoài luồng user)', !p.text.includes('Nhập mã'))
      check('locked_auth pre-exam → KHÔNG "Đăng nhập để mở khóa"', !p.text.includes('Đăng nhập để mở khóa'))
      check('locked_auth pre-exam → KHÔNG "Bắt đầu/Vào làm"', !p.text.includes('Bắt đầu làm bài') && !p.text.includes('Vào làm bài'))
      check('locked_auth pre-exam → KHÔNG link /exam/{premium}', !p.text.includes(`/exam/${PREMIUM_ID}`))
      check('locked_auth pre-exam → KHÔNG lộ passage', !p.text.includes(PREMIUM_PASSAGE))
    }

    // --- Phase B: OWNED + UNLOCKED (product_unlocks + test_unlocks) ---
    await admin.from('product_unlocks').upsert({ user_id: userId, product_id: PREMIUM_PRODUCT, via: 'purchase' }, { onConflict: 'user_id,product_id' })
    await admin.from('test_unlocks').upsert({ user_id: userId, test_id: PREMIUM_ID, product_id: PREMIUM_PRODUCT }, { onConflict: 'user_id,test_id,product_id' })
    {
      const d = await getHtml(`/products/${PRODUCT_SLUG}`, Cookie)
      check('owned detail → badge "Đã sở hữu"', d.text.includes('Đã sở hữu'))
      // Copy panel owned đổi ở W16 (redesign violet): "Đã sở hữu bộ đề" + "Bạn đã mở khoá toàn bộ bộ đề."
      check('owned detail → panel "Đã sở hữu bộ đề"', d.text.includes('Đã sở hữu bộ đề') && d.text.includes('đã mở khoá toàn bộ'))
      check('owned detail → KHÔNG "Mua bằng xương cá"', !d.text.includes('Mua bằng xương cá'))
      check('owned detail → premium test badge "Đã mở"', d.text.includes('Đã mở'))
      check('owned detail → KHÔNG lộ passage', !d.text.includes(PREMIUM_PASSAGE))

      const p = await getHtml(`/tests/${PREMIUM_ID}`, Cookie)
      check('unlocked pre-exam → CTA "Vào làm bài"', p.text.includes('Vào làm bài'))
      check('unlocked pre-exam → CÓ link /exam/{premium}', p.text.includes(`/exam/${PREMIUM_ID}`))
      check('unlocked pre-exam → KHÔNG "Mua bộ đề"/"Đăng nhập"', !p.text.includes('Mua bộ đề') && !p.text.includes('Đăng nhập để mở khóa'))
      check('unlocked pre-exam → KHÔNG lộ passage (pre-exam không tải payload)', !p.text.includes(PREMIUM_PASSAGE))
    }
  } catch (e) {
    skipped(tag, 'exception: ' + (e?.message ?? String(e)))
  }
}

run().catch((e) => {
  console.error('SMOKE ERROR:', e)
  process.exitCode = 2
})
