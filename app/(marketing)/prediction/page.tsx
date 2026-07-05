import Link from 'next/link'
import { ProductCard } from '@/components/product/ProductCard'
import type { ProductCardData } from '@/types/product'

// Prediction packs CHƯA có thật (content pipeline A4) → coming_soon thuần: KHÔNG link,
//   KHÔNG attempts bịa (FE-F04), copy chỉ nói mở khoá bằng xương cá (FE-F07 — redeem không thuộc luồng user).
// Hero KHÔNG dùng form email giả lập (FE-F08) → CTA liên hệ thật.
const PREDICTION: ProductCardData[] = [
  { slug: 'prediction-2026-q3', title: 'Prediction 2026 Q3', priceCoins: 120, skills: ['reading', 'listening'], state: 'coming_soon' },
  { slug: 'prediction-writing-2026', title: 'Writing Prediction 2026', priceCoins: 90, skills: ['writing'], state: 'coming_soon' },
  { slug: 'prediction-2026-q4', title: 'Prediction 2026 Q4', priceCoins: 120, skills: ['mixed'], state: 'coming_soon' },
]

export default function PredictionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-[#2A2740]">
      {/* hero banner (dark) */}
      <div className="relative overflow-hidden rounded-[24px] bg-[#2A2740] px-8 py-10 sm:px-11">
        <span className="pointer-events-none absolute -right-5 -top-10 h-[180px] w-[180px] rounded-full bg-[rgba(124,92,230,0.4)]" />
        <span className="pointer-events-none absolute -bottom-12 -left-2.5 h-[150px] w-[150px] rounded-full bg-[rgba(242,114,78,0.28)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.12] px-3.5 py-[7px] text-[12.5px] font-bold text-white">
            ✦ Kỳ thi sắp tới
          </span>
          <h1 className="mt-4 text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white">
            Đề Prediction, sắp ra mắt
          </h1>
          <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.6] text-[#C8C2DA]">
            Bộ đề dự đoán được xây trước mỗi kỳ thi từ pipeline nội dung mới nhất. Mở khoá bằng xương
            cá ngay khi ra mắt.
          </p>
          <div className="mt-6">
            <Link
              href="/legal/contact"
              className="inline-flex items-center justify-center rounded-[13px] bg-[#7C5CE6] px-6 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#6A48D6]"
            >
              Liên hệ để nhận thông báo →
            </Link>
          </div>
        </div>
      </div>

      {/* on the schedule */}
      <div className="mb-[18px] mt-9">
        <h2 className="text-[24px] font-extrabold tracking-[-0.025em]">Trong kế hoạch</h2>
        <p className="mt-1.5 text-[14.5px] font-semibold text-[#6A6480]">
          Mở khoá bằng xương cá khi ra mắt
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PREDICTION.map((p) => (
          <ProductCard key={p.slug} p={p} />
        ))}
      </div>

      <p className="mt-6 text-center text-[13px] font-semibold text-[#9D96AE]">
        Đề Prediction được mở khoá bằng xương cá khi ra mắt — chưa có dữ liệu lượt làm cho tới lúc đó.
      </p>
    </div>
  )
}
