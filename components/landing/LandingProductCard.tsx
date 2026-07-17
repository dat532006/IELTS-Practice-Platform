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
  coverUrl?: string | null
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

// FE-F07: user không có luồng redeem; CTA premium chỉ nói mua bằng xương cá.
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

function SkillCoverIllustration({ skill }: { skill: string }) {
  if (skill === 'listening') {
    return (
      <svg className="cover-illustration" viewBox="0 0 160 120" aria-hidden="true">
        <path d="M37 69V58a43 43 0 0 1 86 0v11" />
        <rect x="25" y="63" width="26" height="40" rx="13" />
        <rect x="109" y="63" width="26" height="40" rx="13" />
        <path d="M75 63v24M88 54v42M101 66v18" />
      </svg>
    )
  }

  if (skill === 'writing') {
    return (
      <svg className="cover-illustration" viewBox="0 0 160 120" aria-hidden="true">
        <rect x="33" y="17" width="75" height="90" rx="10" />
        <path d="M50 41h40M50 57h31M50 73h24" />
        <path d="m91 91 32-32 12 12-32 32-17 5Z" />
      </svg>
    )
  }

  return (
    <svg className="cover-illustration" viewBox="0 0 160 120" aria-hidden="true">
      <path d="M24 29c19-7 38-3 56 10v69c-18-13-37-17-56-10Z" />
      <path d="M136 29c-19-7-38-3-56 10v69c18-13 37-17 56-10Z" />
      <path d="M42 50h20M42 65h25M98 50h20M93 65h25" />
    </svg>
  )
}

export function LandingProductCard({ p }: { p: LandingProduct }) {
  const primarySkill = p.skills[0] ?? 'reading'
  const sm = skillMeta[primarySkill] ?? skillMeta.reading
  const badge = badgeFor(p.state)
  const attemptsText = p.attempts > 0 ? `${p.attempts.toLocaleString('en-US')} attempts` : 'New'
  const hasCover = Boolean(p.coverUrl)

  const card = (
    <div className={`product-card${p.state === 'coming_soon' ? ' dim' : ''}`}>
      <div
        className={`product-cover${hasCover ? ' has-image' : ''}`}
        style={{ background: `linear-gradient(135deg,${sm.grad1},${sm.grad2})` }}
      >
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="product-cover-image" src={p.coverUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <>
            <span className="cover-circle" />
            <SkillCoverIllustration skill={primarySkill} />
          </>
        )}
        <span className="cover-lbl">{primarySkill.toUpperCase()}</span>
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
          {p.skills.map((skill) => {
            const tag = skillMeta[skill] ?? skillMeta.reading
            return (
              <span key={skill} className="product-tag" style={{ background: tag.chip, color: tag.chipText }}>
                {skill}
              </span>
            )
          })}
        </div>
        <div className={`product-cta ${p.state}`}>
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
    <Link href={p.href} className="product-card-link">
      {card}
    </Link>
  )
}
