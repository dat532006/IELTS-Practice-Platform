'use client'

import { useState } from 'react'
import Link from 'next/link'

// Interactive "Practice by skill" tabs ported from the Claude Design landing.
// Reading/Listening/Writing link to the real catalog filter; Speaking is coming soon.

type Skill = {
  name: string
  mono: string
  tint: string
  dot: string
  desc: string
  count: string
  time: string
  ctaLabel: string
  ctaHref: string
  sample: string
  bullets: string[]
  soon?: boolean
}

const skills: Record<string, Skill> = {
  reading: {
    name: 'Reading', mono: 'R', tint: '#FFEDE6', dot: '#F2724E',
    desc: 'Gap filling, True/False/Not Given, Matching headings and more — on an interface identical to the real test, with a per-passage timer and explained answers right after you submit.',
    count: '24', time: '20 min', ctaLabel: 'Practice Reading', ctaHref: '/products?skill=reading',
    sample: 'True/False/Not Given · Matching headings · Gap filling',
    bullets: ['Per-passage countdown timer', 'Answers with detailed explanations', 'Save progress, retake anytime'],
  },
  listening: {
    name: 'Listening', mono: 'L', tint: '#FFF3DC', dot: '#ECA22B',
    desc: 'Four exam-standard audio parts with the transcript unlocked after you submit, so you can replay any question and pinpoint exactly where your listening slipped.',
    count: '18', time: '30 min', ctaLabel: 'Practice Listening', ctaHref: '/products?skill=listening',
    sample: '4 audio sections · Form & map labelling · Multiple choice',
    bullets: ['Exam-standard 4-part audio', 'Full transcript after submitting', 'Replay any single question'],
  },
  writing: {
    name: 'Writing', mono: 'W', tint: '#F0ECFF', dot: '#7C5CE6',
    desc: 'Task 1 and Task 2 graded by AI against the band descriptors — Task Response, Coherence, Lexical Resource and Grammar — with concrete, sentence-level fixes.',
    count: '12', time: '40 min', ctaLabel: 'Practice Writing', ctaHref: '/products?skill=writing',
    sample: 'Task 1 & Task 2 · AI feedback by 4 criteria',
    bullets: ['Scored on all four criteria', 'Inline sentence-level suggestions', 'Compare against high-band models'],
  },
  speaking: {
    name: 'Speaking', mono: 'S', tint: '#FFE9F1', dot: '#EE5C92',
    desc: 'Part 1–2–3 built around the latest topic sets, with idea prompts and vocabulary to help you respond. This feature is being finished and arrives soon.',
    count: '—', time: '15 min', ctaLabel: 'Get notified', ctaHref: '#',
    sample: 'Part 1 · Part 2 cue card · Part 3 discussion',
    bullets: ['Latest topic-based questions', 'Idea & vocabulary prompts', 'Launching soon'],
    soon: true,
  },
}

const TAB_ORDER: Array<{ key: string; mono: string; dot: string; soon?: boolean }> = [
  { key: 'reading', mono: 'R', dot: '#F2724E' },
  { key: 'listening', mono: 'L', dot: '#ECA22B' },
  { key: 'writing', mono: 'W', dot: '#7C5CE6' },
  { key: 'speaking', mono: 'S', dot: '#EE5C92', soon: true },
]

export function SkillTabs() {
  const [active, setActive] = useState('reading')
  const s = skills[active]

  return (
    <>
      <div className="skill-tabs">
        {TAB_ORDER.map((t) => (
          <button
            key={t.key}
            className={`skill-tab${active === t.key ? ' active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            <span className="skill-mono" style={{ background: t.dot }}>
              {t.mono}
            </span>
            {skills[t.key].name}
            {t.soon && <span className="badge-soon">soon</span>}
          </button>
        ))}
      </div>

      <div className="skill-panel" style={{ background: s.tint }}>
        <div className="skill-copy">
          <div className="skill-name-row">
            <span className="skill-icon" style={{ background: s.dot }}>
              {s.mono}
            </span>
            <h3 className="skill-name">{s.name}</h3>
          </div>
          <p className="skill-desc">{s.desc}</p>
          <div className="skill-stats">
            <div>
              <div className="skill-stat-num">{s.count}</div>
              <div className="skill-stat-lbl">test sets</div>
            </div>
            <div>
              <div className="skill-stat-num">{s.time}</div>
              <div className="skill-stat-lbl">per session</div>
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
          <div className="skill-card-eyebrow">Question types</div>
          <div className="skill-sample">{s.sample}</div>
          <div className="skill-bullets">
            {s.bullets.map((b) => (
              <div key={b} className="skill-bullet">
                <span className="bullet-icon" style={{ background: s.tint }}>
                  <span className="bullet-dot" style={{ background: s.dot }} />
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
