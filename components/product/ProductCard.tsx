import Link from 'next/link'
import type { ProductCardData, ProductState } from '@/types/product'

const BADGE: Record<ProductState, { label: string; cls: string }> = {
  free: { label: 'Miễn phí', cls: 'bg-emerald-100 text-emerald-700' },
  owned: { label: 'Đã sở hữu', cls: 'bg-teal-100 text-teal-700' },
  already_owned: { label: 'Đã sở hữu', cls: 'bg-teal-100 text-teal-700' },
  locked: { label: 'Trả phí', cls: 'bg-amber-100 text-amber-700' },
  coming_soon: { label: 'Coming soon', cls: 'bg-slate-100 text-slate-500' },
}

function Cta({ p }: { p: ProductCardData }) {
  switch (p.state) {
    case 'free':
      return <span className="text-sm font-medium text-emerald-700">Làm thử →</span>
    case 'owned':
    case 'already_owned':
      return <span className="text-sm font-medium text-teal-700">Vào học →</span>
    case 'locked':
      // FE-F07: user KHÔNG có luồng redeem (Owner W16) → CTA chỉ mua bằng coin.
      return (
        <span className="text-sm font-medium text-amber-700">
          🪙 {p.priceCoins} · Mua bằng coin
        </span>
      )
    case 'coming_soon':
      return <span className="text-sm text-slate-400">Sắp ra mắt</span>
  }
}

export function ProductCard({ p }: { p: ProductCardData }) {
  const badge = BADGE[p.state]
  const card = (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-4 transition hover:shadow-md">
      <div className="-mx-4 -mt-4 mb-3 aspect-[16/9] overflow-hidden bg-slate-100">
        {p.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumbnail} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">IELTS</div>
        )}
      </div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
        {typeof p.attemptsTotal === 'number' && (
          <span className="text-xs text-slate-400">{p.attemptsTotal} lượt làm</span>
        )}
      </div>
      <h3 className="font-semibold text-slate-900">{p.title}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        {p.skills.map((s) => (
          <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
            {s}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-4">
        <Cta p={p} />
      </div>
    </div>
  )

  // coming_soon: KHÔNG tạo link (tránh route sai quyền)
  if (p.state === 'coming_soon') {
    return <div aria-disabled="true">{card}</div>
  }
  return (
    <Link href={p.href ?? `/products/${p.slug}`} className="block h-full">
      {card}
    </Link>
  )
}
