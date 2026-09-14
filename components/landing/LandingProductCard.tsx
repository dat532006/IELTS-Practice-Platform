import type { CSSProperties } from 'react'
import Link from 'next/link'
import { FishBone } from '@/components/brand/FishBone'

// Card visual ported from the design handoff ("Product Cards.dc.html" → After).
// State-driven badge / CTA / cover, with a skill-coloured cover, an eyebrow pill,
// a skill·meta row and a full-width skill-coloured action button.

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

// accent = trang trí (gradient/chấm/glow). Chữ và nền nút chữ trắng dùng token vai trò trong globals.css:
//   text (chữ cái trong ô trắng) · solid/solidHover (nút "Start now", chữ trắng ≥4.5:1).
type SkillVisual = { grad: string; accent: string; text: string; solid: string; solidHover: string; shadow: string }

const skillMeta: Record<string, SkillVisual> = {
  reading: {
    grad: 'linear-gradient(140deg,#f79b7d,#f2724e)',
    accent: '#f2724e',
    text: 'var(--skill-reading-text)',
    solid: 'var(--skill-reading-solid)',
    solidHover: 'var(--skill-reading-solid-hover)',
    shadow: '0 12px 24px -12px rgba(242,114,78,.6)',
  },
  listening: {
    grad: 'linear-gradient(140deg,#f6c165,#eca22b)',
    accent: '#eca22b',
    text: 'var(--skill-listening-text)',
    solid: 'var(--skill-listening-solid)',
    solidHover: 'var(--skill-listening-solid-hover)',
    shadow: '0 12px 24px -12px rgba(236,162,43,.6)',
  },
  writing: {
    grad: 'linear-gradient(140deg,#a98cf0,#7c5ce6)',
    accent: '#7c5ce6',
    text: 'var(--skill-writing-text)',
    solid: 'var(--skill-writing-solid)',
    solidHover: 'var(--skill-writing-solid-hover)',
    shadow: '0 12px 24px -12px rgba(124,92,230,.6)',
  },
  speaking: {
    grad: 'linear-gradient(140deg,#f58ab3,#ee5c92)',
    accent: '#ee5c92',
    text: 'var(--skill-speaking-text)',
    solid: 'var(--skill-speaking-solid)',
    solidHover: 'var(--skill-speaking-solid-hover)',
    shadow: '0 12px 24px -12px rgba(238,92,146,.6)',
  },
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function badgeFor(state: LandingCardState) {
  if (state === 'free') return { label: 'Free', bg: '#eaf8f0', color: '#167a4d' }
  if (state === 'locked') return { label: 'Premium', bg: 'var(--badge-amber-bg)', color: 'var(--badge-amber-text)' }
  return { label: 'Coming soon', bg: 'var(--badge-neutral-bg)', color: 'var(--badge-neutral-text)' }
}

// FE-F07: user không có luồng redeem; CTA premium chỉ nói mua bằng xương cá.
function CtaContent({ state, price }: { state: LandingCardState; price: number }) {
  if (state === 'free') return <>Start now →</>
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
  const hasCover = Boolean(p.coverUrl)
  // A genuinely new pack (no attempts yet) earns a "New" pill; established packs
  // show their attempt count in the meta row instead. Coming-soon packs get neither.
  const isNew = p.attempts === 0 && p.state !== 'coming_soon'
  const metaBits: string[] = p.skills.slice(1).map(cap)
  if (p.attempts > 0) metaBits.push(`${p.attempts.toLocaleString('en-US')} attempts`)

  const cardStyle = {
    '--skill-solid': sm.solid,
    '--skill-solid-hover': sm.solidHover,
    '--skill-shadow': sm.shadow,
  } as CSSProperties

  const card = (
    <div className={`product-card${p.state === 'coming_soon' ? ' dim' : ''}`} style={cardStyle}>
      <div className={`product-cover${hasCover ? ' has-image' : ''}`} style={{ background: sm.grad }}>
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="product-cover-image" src={p.coverUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <>
            <span className="cover-circle" />
            <span className="cover-blob-2" />
            <SkillCoverIllustration skill={primarySkill} />
          </>
        )}
        <span className="cover-lbl">
          <span className="cover-lbl-mono" style={{ color: sm.text }}>
            {primarySkill.charAt(0).toUpperCase()}
          </span>
          {primarySkill.toUpperCase()}
        </span>
      </div>
      <div className="product-body">
        <div className="product-meta">
          <span className="product-badge" style={{ background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
          {isNew && <span className="product-badge is-new">New</span>}
        </div>
        <h3 className="product-title">{p.title}</h3>
        <div className="product-meta-row">
          <span className="product-skill-chip">
            <span className="product-skill-dot" style={{ background: sm.accent }} />
            {cap(primarySkill)}
          </span>
          {metaBits.length > 0 && (
            <>
              <span className="product-meta-sep" />
              <span>{metaBits.join(' · ')}</span>
            </>
          )}
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
