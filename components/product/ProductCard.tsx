import Link from 'next/link'
import type { ProductCardData, ProductState } from '@/types/product'
import { skillMeta, SkillGlyph, type SkillKey } from '@/components/brand/skill'
import { FishBone } from '@/components/brand/FishBone'

// Pill "category" ở góc trên body — free = xanh; còn lại tô nhẹ theo skill.
function CategoryPill({ p, meta }: { p: ProductCardData; meta: ReturnType<typeof skillMeta> }) {
  if (p.state === 'free') {
    return (
      <span className="rounded-full bg-[#E7F7EE] px-2.5 py-1 text-[11.5px] font-bold text-[#1E9E63]">
        Miễn phí
      </span>
    )
  }
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11.5px] font-bold"
      style={{ background: `${meta.color}1A`, color: meta.color }}
    >
      {meta.label}
    </span>
  )
}

function Footer({ p }: { p: ProductCardData }) {
  const price = (
    <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#2A2740]">
      <FishBone /> {p.priceCoins}
    </span>
  )
  switch (p.state) {
    case 'free':
      return (
        <>
          <span className="text-[15px] font-extrabold text-[#1E9E63]">Miễn phí</span>
          <span className="text-[14px] font-bold text-[#6A48D6]">Làm ngay →</span>
        </>
      )
    case 'owned':
    case 'already_owned':
      return (
        <>
          <span className="text-[13px] font-extrabold text-[#1E9E63]">Đã sở hữu</span>
          <span className="text-[14px] font-bold text-[#6A48D6]">Vào học →</span>
        </>
      )
    case 'coming_soon':
      return (
        <>
          <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-[#9D96AE]">
            <FishBone /> {p.priceCoins}
          </span>
          <span className="text-[13px] font-bold text-[#B0A9C0]">Sắp ra mắt</span>
        </>
      )
    case 'locked':
    default:
      return (
        <>
          {price}
          <span className="text-[14px] font-bold text-[#6A48D6]">Mở khoá →</span>
        </>
      )
  }
}

export function ProductCard({ p }: { p: ProductCardData }) {
  const skill = (p.skills[0] as SkillKey) ?? 'reading'
  const meta = skillMeta(skill)
  const dimmed = p.state === 'coming_soon'

  const card = (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-[20px] border border-[#EEEAF3] bg-white shadow-[0_14px_30px_-22px_rgba(60,40,90,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-24px_rgba(60,40,90,0.4)] ${dimmed ? 'opacity-90' : ''}`}
    >
      {/* cover */}
      <div
        className="relative flex aspect-[16/9] items-center justify-center overflow-hidden"
        style={p.thumbnail ? undefined : { background: meta.grad }}
      >
        {p.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumbnail} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <>
            <span className="absolute left-3.5 top-3 text-[11px] font-extrabold tracking-[0.1em] text-white/90">
              {meta.coverLabel}
            </span>
            <span className="absolute -right-2.5 -top-[18px] h-[90px] w-[90px] rounded-full bg-white/20" />
            <span className="text-white/85">
              <SkillGlyph skill={skill} size={42} strokeWidth={1.7} />
            </span>
          </>
        )}
        {p.hot && p.state !== 'coming_soon' && (
          <span className="absolute right-3.5 top-3 rounded-full bg-[rgba(42,39,64,0.28)] px-2.5 py-1 text-[11px] font-extrabold text-white">
            🔥 Hot
          </span>
        )}
        {p.state === 'coming_soon' && (
          <span className="absolute right-3.5 top-3 rounded-full bg-white/[0.78] px-2.5 py-1 text-[10.5px] font-extrabold text-[#4A445E]">
            Sắp ra mắt
          </span>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col px-[17px] pb-[18px] pt-4">
        <div className="flex items-center justify-between">
          <CategoryPill p={p} meta={meta} />
          {typeof p.attemptsTotal === 'number' && p.attemptsTotal > 0 && (
            <span className="text-[12px] font-semibold text-[#9AA0AB]">
              🔥 {p.attemptsTotal.toLocaleString('vi-VN')}
            </span>
          )}
        </div>

        <h3 className="mt-3 text-[17px] font-extrabold tracking-[-0.01em] text-[#2A2740]">{p.title}</h3>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span
            className="rounded-[7px] px-2.5 py-[3px] text-[11px] font-bold"
            style={{ background: `${meta.color}1A`, color: meta.color }}
          >
            {meta.label}
          </span>
          {typeof p.testCount === 'number' && p.testCount > 0 && (
            <span className="rounded-[7px] bg-[#F4F1FB] px-2.5 py-[3px] text-[11px] font-bold text-[#6A6480]">
              {p.testCount} đề
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between pt-4">
          <Footer p={p} />
        </div>
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
