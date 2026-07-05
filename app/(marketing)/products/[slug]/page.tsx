import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProductDetail } from '@/lib/products/detail'
import { CurriculumList } from '@/components/product/CurriculumList'
import { PurchaseCta } from '@/components/product/PurchaseCta'

// W4 — Product detail (M04/M10). Server component đọc getProductDetail (RLS server client, optional auth).
// Layout theo design "Purchase & Admin.dc.html" frame 2: cover gradient theo skill, meta, mục lục, aside PurchaseCta.
const SKILL_COVER: Record<string, { grad: string; label: string }> = {
  reading: { grad: 'linear-gradient(135deg,#FFD9C8,#FF9F77)', label: 'READING' },
  listening: { grad: 'linear-gradient(135deg,#FFE6AE,#FFC95E)', label: 'LISTENING' },
  writing: { grad: 'linear-gradient(135deg,#D9CFFF,#B098FF)', label: 'WRITING' },
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const detail = await getProductDetail(supabase, slug, user?.id ?? null)
  if (!detail) notFound()

  const freeCount = detail.tests.filter((t) => t.is_free).length
  const primarySkill = detail.tests[0]?.skill ?? 'reading'
  const cover = SKILL_COVER[primarySkill] ?? SKILL_COVER.reading

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-[#2A2740]">
      <div
        className="overflow-hidden rounded-[24px] border border-[#EEEAF3] p-6 shadow-[0_30px_60px_-38px_rgba(60,40,90,0.42)] sm:p-9"
        style={{ background: 'radial-gradient(120% 70% at 96% -8%, #FBE6DC 0%, rgba(251,230,220,0) 48%), #FFFFFF' }}
      >
        {/* Breadcrumb */}
        <nav className="text-[12.5px] font-semibold text-[#A8A2BA]">
          <Link href="/" className="hover:text-[#7C5CE6]">
            Trang chủ
          </Link>
          <span className="mx-1.5 text-[#D2CCDD]">/</span>
          <Link href="/products" className="hover:text-[#7C5CE6]">
            Bộ đề
          </Link>
          <span className="mx-1.5 text-[#D2CCDD]">/</span>
          <span className="text-[#564F6B]">{detail.title}</span>
        </nav>

        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[1fr_21rem]">
          {/* Main */}
          <div>
            {/* Cover */}
            <div
              className="relative flex aspect-[16/7] items-center justify-center overflow-hidden rounded-[18px]"
              style={detail.thumbnail_url ? undefined : { background: cover.grad }}
            >
              {detail.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.thumbnail_url} alt={detail.title} className="h-full w-full object-cover" />
              ) : (
                <>
                  <span className="absolute left-[18px] top-4 text-[12px] font-extrabold tracking-[0.1em] text-white/90">
                    {cover.label}
                  </span>
                  <span className="absolute -right-3.5 -top-[30px] h-[140px] w-[140px] rounded-full bg-white/20" />
                  <span className="text-[96px] font-extrabold leading-none text-white/[0.62]">
                    {(detail.title ?? '?').charAt(0).toUpperCase()}
                  </span>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-extrabold tracking-[-0.025em]">{detail.title}</h1>
              {detail.owned ? (
                <span className="rounded-full bg-[#E7F7EE] px-2.5 py-[5px] text-[12px] font-extrabold text-[#1E9E63]">
                  ✓ Đã sở hữu
                </span>
              ) : detail.price_coins === 0 ? (
                <span className="rounded-full bg-[#E7F7EE] px-2.5 py-[5px] text-[12px] font-extrabold text-[#1E9E63]">
                  Miễn phí
                </span>
              ) : (
                <span className="rounded-full bg-[#FFF1DC] px-2.5 py-[5px] text-[12px] font-extrabold text-[#C98A1A]">
                  🔒 Chưa mở
                </span>
              )}
            </div>

            <p className="mt-2 text-[14px] font-semibold text-[#857F96]">
              {detail.tests.length} đề
              {freeCount > 0 && (
                <>
                  <span className="mx-1 text-[#D2CCDD]">·</span>
                  {freeCount} đề miễn phí
                </>
              )}
              {detail.attempts_total > 0 && (
                <>
                  <span className="mx-1 text-[#D2CCDD]">·</span>🔥 {detail.attempts_total.toLocaleString('vi-VN')} lượt làm
                </>
              )}
            </p>

            {detail.description && (
              <p className="mt-3.5 max-w-[42em] whitespace-pre-line text-[15.5px] leading-[1.65] text-[#4A445E]">
                {detail.description}
              </p>
            )}

            {/* CTA mobile (trước mục lục) */}
            <div className="mt-5 lg:hidden">
              <PurchaseCta
                productId={detail.id}
                priceCoins={detail.price_coins}
                owned={detail.owned}
                testCount={detail.tests.length}
              />
            </div>

            <h2 id="muc-luc" className="mt-8 scroll-mt-24 text-[17px] font-extrabold tracking-[-0.01em]">
              Mục lục đề
            </h2>
            <div className="mt-3.5">
              <CurriculumList tests={detail.tests} isAuthed={!!user} />
            </div>
          </div>

          {/* Aside CTA (sticky desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <PurchaseCta
                productId={detail.id}
                priceCoins={detail.price_coins}
                owned={detail.owned}
                testCount={detail.tests.length}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
