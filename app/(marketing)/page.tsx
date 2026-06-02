import Link from 'next/link'
import { ProductCard } from '@/components/product/ProductCard'
import type { ProductCardData } from '@/types/product'

// ⚠️ W1+2 shell: dữ liệu mẫu tĩnh (chưa nối API). Catalog thật ở W3 qua /api/products
//    (chỉ metadata public — KHÔNG gọi premium payload).
const HOT: ProductCardData[] = [
  { slug: 'reading-vol-1-9', title: 'READING VOL 1–9', priceCoins: 200, skills: ['reading'], attemptsTotal: 1240, state: 'locked' },
  { slug: 'listening-starter', title: 'LISTENING Starter', priceCoins: 0, skills: ['listening'], attemptsTotal: 980, state: 'free' },
  { slug: 'writing-task2-pack', title: 'WRITING Task 2 Pack', priceCoins: 150, skills: ['writing'], attemptsTotal: 540, state: 'locked' },
]
const FREE: ProductCardData[] = [
  { slug: 'reading-free-1', title: 'Reading Test Free 1', priceCoins: 0, skills: ['reading'], attemptsTotal: 3200, state: 'free' },
  { slug: 'listening-free-1', title: 'Listening Test Free 1', priceCoins: 0, skills: ['listening'], attemptsTotal: 2100, state: 'free' },
]
const PREDICTION: ProductCardData[] = [
  { slug: 'prediction-2026-q3', title: 'Prediction 2026 Q3', priceCoins: 120, skills: ['reading', 'listening'], attemptsTotal: 410, state: 'locked' },
]

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

export default function LandingPage() {
  return (
    <>
      {/* 1. Announcement bar */}
      <div className="bg-teal-700 py-2 text-center text-sm text-white">
        🎉 Đề tự soạn 100% · Giao diện chuẩn thi thật · AI chấm Writing
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
          Luyện thi IELTS <span className="text-teal-700">Reading · Listening · Writing</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Làm bài như thi thật, chấm điểm ở server, AI feedback Writing theo band descriptor.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/register" className="rounded-md bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800">
            Thi thử ngay
          </Link>
          <Link href="/products" className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Xem bộ đề
          </Link>
        </div>
        {/* Trust metric */}
        <p className="mt-6 text-sm text-slate-400">10.000+ lượt làm bài · 4.8/5 đánh giá</p>
      </section>

      {/* Search "Bộ đề mới nhất" (shell tĩnh) */}
      <div className="mx-auto max-w-2xl px-4">
        <form action="/products" className="flex gap-2">
          <input
            name="q"
            placeholder="Tìm bộ đề mới nhất..."
            className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm outline-none focus:border-teal-600"
          />
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Tìm</button>
        </form>
      </div>

      <Section title="Hot collections" sub="Bộ đề được làm nhiều nhất">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOT.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </Section>

      <Section title="Đề Free" sub="Làm thử miễn phí, không cần mua">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FREE.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </Section>

      <Section title="Prediction" sub="Đề dự đoán theo kỳ">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PREDICTION.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </Section>

      {/* Lead form */}
      <section className="bg-slate-50 py-12">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-xl font-bold">Bạn cần hỗ trợ?</h2>
          <p className="mt-1 text-sm text-slate-500">Để lại email, đội ngũ sẽ liên hệ tư vấn lộ trình.</p>
          <form className="mx-auto mt-4 flex max-w-md gap-2">
            <input
              type="email"
              required
              placeholder="email@cua-ban.com"
              className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm outline-none focus:border-teal-600"
            />
            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">Gửi</button>
          </form>
        </div>
      </section>

      {/* Testimonials */}
      <Section title="Học viên nói gì">
        <div className="grid gap-4 sm:grid-cols-3">
          {['Giao diện y như thi thật.', 'AI chấm Writing chi tiết.', 'Mua bằng coin tiện lợi.'].map((t, i) => (
            <blockquote key={i} className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              “{t}”
            </blockquote>
          ))}
        </div>
      </Section>
    </>
  )
}
