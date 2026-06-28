import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProductDetail } from '@/lib/products/detail'
import { CurriculumList } from '@/components/product/CurriculumList'
import { PurchaseCta } from '@/components/product/PurchaseCta'

// W4 — Product detail (M04/M10). Server component đọc thẳng getProductDetail (RLS server client,
// optional auth). Mục lục theo `position`, state owned/locked từ backend. KHÔNG exam payload.
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const detail = await getProductDetail(supabase, slug, user?.id ?? null)
  if (!detail) notFound()

  const freeCount = detail.tests.filter((t) => t.is_free).length

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-400">
        <Link href="/" className="hover:text-teal-700">
          Trang chủ
        </Link>{' '}
        /{' '}
        <Link href="/products" className="hover:text-teal-700">
          Bộ đề
        </Link>{' '}
        / <span className="text-slate-600">{detail.title}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* Main */}
        <div>
          <div className="aspect-[16/7] overflow-hidden rounded-lg bg-slate-100">
            {detail.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detail.thumbnail_url}
                alt={detail.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300">
                IELTS Practice
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{detail.title}</h1>
            {detail.owned && (
              <span className="rounded bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                Đã sở hữu
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {detail.tests.length} đề
            {freeCount > 0 && ` · ${freeCount} đề miễn phí`}
            {detail.attempts_total > 0 && ` · 🔥 ${detail.attempts_total} lượt làm`}
          </p>

          {detail.description && (
            <p className="mt-3 whitespace-pre-line text-slate-700">{detail.description}</p>
          )}

          {/* CTA trên mobile (trước mục lục) */}
          <div className="mt-5 lg:hidden">
            <PurchaseCta productId={detail.id} priceCoins={detail.price_coins} owned={detail.owned} />
          </div>

          <h2 className="mt-8 text-lg font-semibold text-slate-900">Mục lục đề</h2>
          <div className="mt-3">
            <CurriculumList tests={detail.tests} isAuthed={!!user} />
          </div>

          {/* Related — placeholder (chưa có nguồn dữ liệu related ở W4) */}
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-slate-900">Bộ đề liên quan</h2>
            <p className="mt-2 text-sm text-slate-400">Đang cập nhật.</p>
          </section>
        </div>

        {/* Aside CTA (sticky desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <PurchaseCta productId={detail.id} priceCoins={detail.price_coins} owned={detail.owned} />
          </div>
        </aside>
      </div>
    </div>
  )
}
