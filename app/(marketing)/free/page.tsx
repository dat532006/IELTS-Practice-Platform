import { ProductCard } from '@/components/product/ProductCard'
import type { ProductCardData } from '@/types/product'

const FREE: ProductCardData[] = [
  { slug: 'reading-free-1', title: 'Reading Test Free 1', priceCoins: 0, skills: ['reading'], attemptsTotal: 3200, state: 'free' },
  { slug: 'listening-free-1', title: 'Listening Test Free 1', priceCoins: 0, skills: ['listening'], attemptsTotal: 2100, state: 'free' },
  { slug: 'writing-free-1', title: 'Writing Task 1 Free', priceCoins: 0, skills: ['writing'], attemptsTotal: 870, state: 'free' },
]

export default function FreePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold">Đề Free</h1>
      <p className="mt-1 text-sm text-slate-500">Làm thử miễn phí, không cần mua.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FREE.map((p) => <ProductCard key={p.slug} p={p} />)}
      </div>
    </div>
  )
}
