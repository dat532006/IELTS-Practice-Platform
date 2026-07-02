import { createClient } from '@/lib/supabase/server'
import { ProductCard } from '@/components/product/ProductCard'
import type { ProductCardData } from '@/types/product'

// FE-F04: đề free lấy từ DB (RLS published-only, metadata columns) — hết hardcode seed UUID + attempts bịa.
//   DB lỗi → danh sách rỗng (empty state), không 500.
export default async function FreePage() {
  let cards: ProductCardData[] = []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('tests')
      .select('id, title, type, is_free, attempts_count')
      .eq('is_free', true)
      .order('attempts_count', { ascending: false })
      .limit(24)
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
  } catch {
    /* DB không sẵn sàng → empty state */
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold">Đề Free</h1>
      <p className="mt-1 text-sm text-slate-500">Làm thử miễn phí, không cần mua.</p>
      {cards.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Chưa có đề miễn phí nào — vui lòng quay lại sau.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      )}
    </div>
  )
}
