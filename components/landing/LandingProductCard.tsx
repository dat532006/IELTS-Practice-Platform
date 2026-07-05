import Link from 'next/link'
import { FishBone } from '@/components/brand/FishBone'

// Card visual ported from the Claude Design landing ("IELTS Practice Home.dc.html").
// State-driven badge / CTA / cover gradient, matching the design's deriveCard() logic.

export type LandingCardState = 'free' | 'locked' | 'coming_soon'

export type LandingProduct = {
  title: string
  skills: string[]
  attempts: number
  state: LandingCardState
  price: number
  href?: string
}

const skillMeta: Record<string, { grad1: string; grad2: string; chip: string; chipText: string }> = {
  reading: { grad1: '#FFD9C8', grad2: '#FF9F77', chip: '#FFEDE6', chipText: '#C7542F' },
  listening: { grad1: '#FFE6AE', grad2: '#FFC95E', chip: '#FFF3DC', chipText: '#A87614' },
  writing: { grad1: '#D9CFFF', grad2: '#B098FF', chip: '#F0ECFF', chipText: '#5B43C7' },
}

function badgeFor(state: LandingCardState) {
  if (state === 'free') return { label: 'Free', bg: '#E7F7EE', color: '#1E9E63' }
  if (state === 'locked') return { label: 'Premium', bg: '#FFF1DC', color: '#C98A1A' }
  return { label: 'Coming soon', bg: '#EFEBF2', color: '#8B8398' }
}

// FE-F07: user KHÔNG có luồng redeem (Owner W16: redeem chỉ admin/offline) → CTA chỉ nói mua bằng xương cá.
function ctaFor(state: LandingCardState) {
  if (state === 'free') return { color: '#1E9E63' }
  if (state === 'locked') return { color: '#C98A1A' }
  return { color: '#9D96AE' }
}

function CtaContent({ state, price }: { state: LandingCardState; price: number }) {
  if (state === 'free') return <>Try now →</>
  if (state === 'locked')
    return (
      <span className="inline-flex items-center gap-1.5">
        <FishBone /> {price} · Buy with fish bones
      </span>
    )
  return <>Coming soon</>
}

export function LandingProductCard({ p }: { p: LandingProduct }) {
  const sm = skillMeta[p.skills[0]] ?? skillMeta.reading
  const badge = badgeFor(p.state)
  const cta = ctaFor(p.state)
  const attemptsText = p.attempts > 0 ? `${p.attempts.toLocaleString('en-US')} attempts` : 'New'

  const card = (
    <div className={`product-card${p.state === 'coming_soon' ? ' dim' : ''}`}>
      <div className="product-cover" style={{ background: `linear-gradient(135deg,${sm.grad1},${sm.grad2})` }}>
        <span className="cover-lbl">{p.skills[0].toUpperCase()}</span>
        <span className="cover-circle" />
        <span className="cover-mono">{p.skills[0].charAt(0).toUpperCase()}</span>
      </div>
      <div className="product-body">
        <div className="product-meta">
          <span className="product-badge" style={{ background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
          <span className="product-attempts">{attemptsText}</span>
        </div>
        <h3 className="product-title">{p.title}</h3>
        <div className="product-tags">
          {p.skills.map((s) => {
            const tag = skillMeta[s] ?? skillMeta.reading
            return (
              <span key={s} className="product-tag" style={{ background: tag.chip, color: tag.chipText }}>
                {s}
              </span>
            )
          })}
        </div>
        <div className="product-cta" style={{ color: cta.color }}>
          <CtaContent state={p.state} price={p.price} />
        </div>
      </div>
    </div>
  )

  // coming_soon: no link (avoid routing to content the user can't access yet)
  if (p.state === 'coming_soon' || !p.href) {
    return <div aria-disabled={p.state === 'coming_soon'}>{card}</div>
  }
  return (
    <Link href={p.href} className="block">
      {card}
    </Link>
  )
}
