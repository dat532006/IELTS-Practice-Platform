import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getProductCatalog } from '@/lib/products/queries'
import { ProductCard } from '@/components/product/ProductCard'
import { CatalogFilters } from '@/components/product/CatalogFilters'
import type { CatalogParams } from '@/types/catalog'
import type { ProductCardData } from '@/types/product'

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function pageHref(params: CatalogParams, page: number): string {
  const sp = new URLSearchParams()
  for (const k of ['q', 'skill', 'qtype', 'difficulty', 'free', 'sort', 'page_size'] as const) {
    const v = params[k]
    if (v) sp.set(k, v)
  }
  sp.set('page', String(page))
  return `/products?${sp.toString()}`
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const params: CatalogParams = {
    q: first(sp.q),
    skill: first(sp.skill),
    qtype: first(sp.qtype),
    difficulty: first(sp.difficulty),
    free: first(sp.free),
    sort: first(sp.sort),
    page: first(sp.page),
    page_size: first(sp.page_size),
  }

  const supabase = await createClient()
  const { data } = await getProductCatalog(supabase, params)
  const { page, total, total_pages } = data.pagination

  const cards: ProductCardData[] = data.items.map((p) => ({
    slug: p.slug,
    title: p.title,
    thumbnail: p.thumbnail_url,
    priceCoins: p.price_coins,
    skills: [p.skill],
    attemptsTotal: p.attempts_total,
    testCount: p.test_count,
    hot: p.attempts_total >= 1000, // suy từ lượt làm thật, không bịa
    state: p.is_free ? 'free' : 'locked',
  }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-[#2A2740]">
      <h1 className="text-[32px] font-extrabold tracking-[-0.03em]">Bộ đề</h1>
      <p className="mt-1.5 text-[15px] font-semibold text-[#6A6480]">
        {total} bộ đề · 100% đề đã ra thi thật · giao diện chuẩn thi thật
      </p>

      <div className="mt-[22px]">
        <Suspense fallback={null}>
          <CatalogFilters total={total} />
        </Suspense>
      </div>

      {cards.length === 0 ? (
        <p className="mt-12 text-center text-[15px] font-semibold text-[var(--text-subtle)]">
          {params.skill && ['reading', 'listening', 'writing'].includes(params.skill)
            ? `Chưa có bộ đề ${params.skill.charAt(0).toUpperCase() + params.skill.slice(1)} — nội dung đang được bổ sung.`
            : 'Không có bộ đề khớp bộ lọc.'}
        </p>
      ) : (
        <>
          {/* Tiêu đề thẻ là h3 → cần h2 cho lưới (ẩn hình, chỉ cho điều hướng heading của trình đọc màn hình). */}
          <h2 className="sr-only">Danh sách bộ đề</h2>
          {/* `lap`(960) thay `lg`(1024): laptop scaling 150–200% có viewport ~1000px, trước đây chỉ ra 2 cột. */}
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lap:grid-cols-3">
            {cards.map((c) => (
              <ProductCard key={c.slug} p={c} />
            ))}
          </div>

          {total_pages > 1 && (
            <nav className="mt-7 flex items-center justify-center gap-2">
              {page > 1 ? (
                <Link
                  href={pageHref(params, page - 1)}
                  aria-label="Trang trước"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E8E2F0] bg-white font-bold text-[#4A445E] transition hover:bg-[#FBFAFF]"
                >
                  ←
                </Link>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E8E2F0] bg-white font-bold text-[#B0A9C0]">
                  ←
                </span>
              )}

              {Array.from({ length: total_pages }, (_, i) => i + 1).map((n) =>
                n === page ? (
                  <span
                    key={n}
                    aria-current="page"
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#2A2740] text-[14px] font-extrabold text-white"
                  >
                    {n}
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={pageHref(params, n)}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E8E2F0] bg-white text-[14px] font-bold text-[#4A445E] transition hover:bg-[#FBFAFF]"
                  >
                    {n}
                  </Link>
                ),
              )}

              {page < total_pages ? (
                <Link
                  href={pageHref(params, page + 1)}
                  aria-label="Trang sau"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E8E2F0] bg-white font-bold text-[#4A445E] transition hover:bg-[#FBFAFF]"
                >
                  →
                </Link>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E8E2F0] bg-white font-bold text-[#B0A9C0]">
                  →
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
