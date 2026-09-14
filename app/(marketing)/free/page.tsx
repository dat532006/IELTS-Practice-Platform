import { createClient } from '@/lib/supabase/server'
import { ProductCard } from '@/components/product/ProductCard'
import type { ProductCardData } from '@/types/product'

// FE-F04: đề free lấy từ DB (RLS published-only, metadata columns) — hết hardcode seed UUID + attempts bịa.
// UI-006: PHÂN BIỆT "hết đề free" (rỗng thật) với "DB lỗi" (sự cố) — trước đây lỗi DB cũng ra empty state
//   "chưa có đề" (báo sai). Lỗi → trạng thái sự cố có nút tải lại; rỗng thật → thông báo hết đề.
export default async function FreePage() {
  let cards: ProductCardData[] = []
  let failed = false
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tests')
      .select('id, title, type, is_free, attempts_count')
      .eq('is_free', true)
      .order('attempts_count', { ascending: false })
      .limit(24)
    if (error) {
      failed = true
    } else {
      type Row = { id: string; title: string; type: string; attempts_count: number | null }
      cards = ((data ?? []) as unknown as Row[]).map((t) => ({
        slug: t.id,
        href: `/tests/${t.id}` as const,
        title: t.title,
        priceCoins: 0,
        skills: [t.type],
        attemptsTotal: t.attempts_count ?? 0,
        state: 'free' as const,
      }))
    }
  } catch {
    failed = true // DB không sẵn sàng → sự cố (KHÔNG giả vờ "hết đề")
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold">Đề Free</h1>
      <p className="mt-1 text-sm text-slate-500">Làm thử miễn phí, không cần mua.</p>
      {failed ? (
        <div className="mt-10 text-center">
          <p className="text-sm font-semibold text-slate-500">Không tải được danh sách đề free — có thể do sự cố kết nối tạm thời.</p>
          <a href="/free" className="mt-3 inline-block rounded-[11px] bg-[#7C5CE6] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#6A48D6]">Tải lại</a>
        </div>
      ) : cards.length === 0 ? (
        <p className="mt-10 text-center text-sm text-[var(--text-subtle)]">Chưa có đề miễn phí nào — vui lòng quay lại sau.</p>
      ) : (
        <>
          {/* Tiêu đề thẻ ProductCard là h3 → h2 ẩn hình cho lưới để heading không nhảy h1 → h3. */}
          <h2 className="sr-only">Danh sách đề miễn phí</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lap:grid-cols-3">
            {cards.map((p) => <ProductCard key={p.slug} p={p} />)}
          </div>
        </>
      )}
    </div>
  )
}
