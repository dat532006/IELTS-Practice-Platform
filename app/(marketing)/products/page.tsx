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
    state: p.is_free ? 'free' : 'locked',
  }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">Bộ đề</h1>
      <p className="mt-1 text-sm text-slate-500">{total} bộ đề</p>

      <div className="mt-5">
        <Suspense fallback={null}>
          <CatalogFilters />
        </Suspense>
      </div>

      {cards.length === 0 ? (
        <p className="mt-12 text-center text-slate-400">Không có bộ đề khớp bộ lọc.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <ProductCard key={c.slug} p={c} />
            ))}
          </div>

          {total_pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
              {page > 1 ? (
                <Link
                  href={pageHref(params, page - 1)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                >
                  ← Trước
                </Link>
              ) : (
                <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">← Trước</span>
              )}
              <span className="text-slate-600">
                Trang {page}/{total_pages}
              </span>
              {page < total_pages ? (
                <Link
                  href={pageHref(params, page + 1)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
                >
                  Sau →
                </Link>
              ) : (
                <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">Sau →</span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
