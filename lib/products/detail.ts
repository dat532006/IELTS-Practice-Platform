import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductDetail, ProductDetailTest } from '@/types/catalog'
import { getUnlockedTestIds, hasProductUnlock } from '@/lib/exam/access'

// ============================================================
// W4 — GET /api/products/[slug] data path (M04).
// Đọc bằng RLS server client (KHÔNG service_role): chỉ product/test PUBLISHED + cột metadata.
// passages/questions không grant client → vật lý không lấy được (DTO whitelist + RLS).
// owned/locked theo state table contract §1.
// ============================================================

type ProductRow = {
  id: string
  slug: string
  title: string
  description: string | null
  price_coins: number
  thumbnail: string | null
  thumb_pos_x: number | null
  thumb_pos_y: number | null
  thumb_zoom: number | null
}
type LinkRow = { test_id: string; position: number }
type TestMetaRow = {
  id: string
  title: string
  type: ProductDetailTest['skill']
  is_free: boolean
  duration_sec: number | null
  attempts_count: number | null
  cover_image: string | null
  cover_pos_x: number | null
  cover_pos_y: number | null
  cover_zoom: number | null
}

export async function getProductDetail(
  supabase: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<ProductDetail | null> {
  // 1) Product (RLS: published-only). Không có → null → route trả 404.
  const { data: productData, error: pErr } = await supabase
    .from('products')
    .select('id, slug, title, description, price_coins, thumbnail, thumb_pos_x, thumb_pos_y, thumb_zoom')
    .eq('slug', slug)
    .maybeSingle()
  if (pErr) throw new Error(pErr.message)
  if (!productData) return null
  const product = productData as unknown as ProductRow

  // 2) Mục lục (RLS collection_tests: chỉ lộ mapping khi CẢ product VÀ test published) theo position.
  const { data: linkData, error: lErr } = await supabase
    .from('collection_tests')
    .select('test_id, position')
    .eq('product_id', product.id)
    .order('position', { ascending: true })
  if (lErr) throw new Error(lErr.message)
  const links = (linkData ?? []) as unknown as LinkRow[]
  const testIds = links.map((l) => l.test_id)

  // 3) Test metadata (RLS published + column-grant; KHÔNG passages/questions).
  const metaById = new Map<string, TestMetaRow>()
  if (testIds.length > 0) {
    const { data: testData, error: tErr } = await supabase
      .from('tests')
      .select('id, title, type, is_free, duration_sec, attempts_count, cover_image, cover_pos_x, cover_pos_y, cover_zoom')
      .in('id', testIds)
    if (tErr) throw new Error(tErr.message)
    for (const t of (testData ?? []) as unknown as TestMetaRow[]) metaById.set(t.id, t)
  }

  // 4) Trạng thái sở hữu/unlock (RLS own-rows; unauth ⇒ rỗng).
  //    `owned` = cờ DTO product-level (đã sở hữu bundle, dùng cho UI). KHÔNG dùng để mở payload từng test.
  //    `unlockedSet` = test_unlocks của user — ĐIỀU KIỆN DUY NHẤT ngoài is_free để 1 test unlocked (LUẬT THÉP #3).
  const owned = await hasProductUnlock(supabase, product.id, userId)
  const unlockedSet = await getUnlockedTestIds(supabase, testIds, userId)

  // 5) DTO whitelist + locked CÙNG RULE với exam guard: is_free OR test_unlocks.
  //    (Không dùng `owned` ở đây → detail & exam luôn nhất quán: owned-mà-chưa-expand-test_unlocks ⇒ vẫn locked.)
  const tests: ProductDetailTest[] = links
    .filter((l) => metaById.has(l.test_id)) // safety net: chỉ test RLS cho phép (published)
    .map((l) => {
      const m = metaById.get(l.test_id)!
      const is_free = !!m.is_free
      const unlocked = is_free || unlockedSet.has(m.id)
      return {
        id: m.id,
        title: m.title,
        skill: m.type,
        duration_sec: m.duration_sec ?? 0,
        is_free,
        locked: !unlocked,
        position: l.position,
        cover_image: m.cover_image,
        cover_pos_x: m.cover_pos_x ?? 50,
        cover_pos_y: m.cover_pos_y ?? 50,
        cover_zoom: m.cover_zoom ?? 100,
      }
    })

  // Social proof product-level = tổng lượt làm các đề published trong bundle (= attempts_total matview).
  let attemptsTotal = 0
  for (const m of metaById.values()) attemptsTotal += m.attempts_count ?? 0

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    price_coins: product.price_coins,
    thumbnail_url: product.thumbnail,
    // Khung hiển thị (migration 20260726000200) — fallback canh giữa/vừa khung nếu DB chưa áp.
    thumb_pos_x: product.thumb_pos_x ?? 50,
    thumb_pos_y: product.thumb_pos_y ?? 50,
    thumb_zoom: product.thumb_zoom ?? 100,
    owned,
    attempts_total: attemptsTotal,
    tests,
  }
}
