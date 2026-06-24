import { ProductCard } from '@/components/product/ProductCard'
import type { ProductCardData } from '@/types/product'

const PREDICTION: ProductCardData[] = [
  { slug: 'prediction-2026-q3', title: 'Prediction 2026 Q3', priceCoins: 120, skills: ['reading', 'listening'], attemptsTotal: 410, state: 'coming_soon' },
  { slug: 'prediction-writing-2026', title: 'Writing Prediction 2026', priceCoins: 90, skills: ['writing'], attemptsTotal: 230, state: 'coming_soon' },
]

export default function PredictionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold">Đề Prediction</h1>
      <p className="mt-1 text-sm text-slate-500">Đề dự đoán theo kỳ — mở khóa bằng coin hoặc mã.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PREDICTION.map((p) => <ProductCard key={p.slug} p={p} />)}
      </div>
    </div>
  )
}
