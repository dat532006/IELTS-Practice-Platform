'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'

// Interactive "Practice by skill" tabs ported from the design handoff
// ("Practice By Skill.dc.html" → After). Line skill icons replace the old letter
// monograms; picking a tab swaps the whole panel (icon, soft-gradient background,
// copy, stats, CTA and question-types card). Reading/Listening/Writing link to the
// real catalog filter; Speaking is coming soon.

type Skill = {
  name: string
  icon: string
  accent: string
  soft: string
  desc: string
  stat1: string
  stat1lbl: string
  stat2: string
  stat2lbl: string
  ctaLabel: string
  ctaHref: string
  cardTitle: string
  bullets: string[]
  soon?: boolean
}

const skills: Record<string, Skill> = {
  reading: {
    name: 'Reading', icon: 'reading', accent: '#f2724e', soft: 'linear-gradient(160deg,#fdeee7,#fbe1d5)',
    desc: 'Gap filling, True/False/Not Given, Matching headings and more — on an interface identical to the real test, with a per-passage timer and explained answers right after you submit.',
    stat1: '24', stat1lbl: 'test sets', stat2: '20 min', stat2lbl: 'per session',
    ctaLabel: 'Practice Reading', ctaHref: '/products?skill=reading',
    cardTitle: 'True/False/Not Given · Matching headings · Gap filling',
    bullets: ['Per-passage countdown timer', 'Answers with detailed explanations', 'Save progress, retake anytime'],
  },
  listening: {
    name: 'Listening', icon: 'listening', accent: '#eca22b', soft: 'linear-gradient(160deg,#fdf1dc,#fbe8c4)',
    desc: 'Full recordings played once, just like the exam — form completion, multiple choice and matching, with the audio player and answer sheet side by side.',
    stat1: '4', stat1lbl: 'sections / test', stat2: '30 min', stat2lbl: 'per test',
    ctaLabel: 'Practice Listening', ctaHref: '/products?skill=listening',
    cardTitle: 'Form completion · Multiple choice · Matching',
    bullets: ['Audio plays once, like the real exam', 'Answers with detailed explanations', 'Save progress, retake anytime'],
  },
  writing: {
    name: 'Writing', icon: 'writing', accent: '#7c5ce6', soft: 'linear-gradient(160deg,#f2ecff,#e7ddff)',
    desc: 'Write Task 1 and Task 2 in a distraction-free editor, then get AI feedback mapped to the four official band descriptors with sentence-level suggestions.',
    stat1: '2', stat1lbl: 'tasks / test', stat2: '60 min', stat2lbl: 'per test',
    ctaLabel: 'Practice Writing', ctaHref: '/products?skill=writing',
    cardTitle: 'Task 1 report/letter · Task 2 essay',
    bullets: ['AI grading by band descriptor', 'Sentence-level rewrite suggestions', 'Estimated band you can track'],
  },
  speaking: {
    name: 'Speaking', icon: 'speaking', accent: '#ee5c92', soft: 'linear-gradient(160deg,#ffe9f1,#ffd7e6)',
    desc: 'Guided Part 1–3 prompts with a built-in recorder and prep timer, so you can rehearse the full interview at your own pace. Launching soon.',
    stat1: '3', stat1lbl: 'parts', stat2: '~14 min', stat2lbl: 'per session',
    ctaLabel: 'Notify me', ctaHref: '#',
    cardTitle: 'Interview · Long turn · Discussion',
    bullets: ['Record and replay your answers', 'Prep timer for the long turn', 'Band-descriptor checklist'],
    soon: true,
  },
}

const TAB_ORDER = ['reading', 'listening', 'writing', 'speaking'] as const

// Line skill glyphs (stroke, currentColor) — book / headphones / pencil / mic.
const ICON_PATHS: Record<string, ReactNode> = {
  reading: (
    <>
      <path d="M12 6.5c-2-1.3-5.2-1.3-8-.6v11.6c2.8-.7 6-.7 8 .6 2-1.3 5.2-1.3 8-.6V5.9c-2.8-.7-6-.7-8 .6z" />
      <path d="M12 6.5v11.6" />
    </>
  ),
  listening: (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="3" y="13" width="4.2" height="7" rx="1.6" />
      <rect x="16.8" y="13" width="4.2" height="7" rx="1.6" />
    </>
  ),
  writing: (
    <>
      <path d="M5 19l1.2-4.2L16 5l3 3-9.8 9.8L5 19z" />
      <path d="M14 7l3 3" />
    </>
  ),
  speaking: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3.5" />
      <path d="M8.5 20.5h7" />
    </>
  ),
}

function SkillGlyph({ kind, size }: { kind: string; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[kind]}
    </svg>
  )
}

export function SkillTabs() {
  const [active, setActive] = useState<string>('reading')
  const s = skills[active]

  return (
    <>
      <div className="skill-tabs">
        {TAB_ORDER.map((key) => {
          const t = skills[key]
          return (
            <button
              key={key}
              type="button"
              className={`skill-tab${active === key ? ' active' : ''}`}
              onClick={() => setActive(key)}
              aria-pressed={active === key}
            >
              <span className="skill-mono" style={{ background: t.accent }}>
                <SkillGlyph kind={t.icon} size={15} />
              </span>
              {t.name}
              {t.soon && <span className="badge-soon">Soon</span>}
            </button>
          )
        })}
      </div>

      <div className="skill-panel" style={{ background: s.soft }}>
        <div className="skill-copy">
          <div className="skill-name-row">
            <span className="skill-icon" style={{ background: s.accent, boxShadow: `0 8px 18px ${s.accent}55` }}>
              <SkillGlyph kind={s.icon} size={24} />
            </span>
            <h3 className="skill-name">{s.name}</h3>
          </div>
          <p className="skill-desc">{s.desc}</p>
          <div className="skill-stats">
            <div>
              <div className="skill-stat-num">{s.stat1}</div>
              <div className="skill-stat-lbl">{s.stat1lbl}</div>
            </div>
            <div>
              <div className="skill-stat-num">{s.stat2}</div>
              <div className="skill-stat-lbl">{s.stat2lbl}</div>
            </div>
          </div>
          {s.soon ? (
            <span className="btn-dark" aria-disabled="true">
              {s.ctaLabel} →
            </span>
          ) : (
            <Link href={s.ctaHref} className="btn-dark">
              {s.ctaLabel} →
            </Link>
          )}
        </div>

        <div className="skill-card">
          <div className="skill-card-eyebrow">{s.soon ? 'What to expect' : 'Question types'}</div>
          <div className="skill-sample">{s.cardTitle}</div>
          <div className="skill-bullets">
            {s.bullets.map((b) => (
              <div key={b} className="skill-bullet">
                <span className="bullet-icon" style={{ background: `${s.accent}1f` }}>
                  <span className="bullet-dot" style={{ background: s.accent }} />
                </span>
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
