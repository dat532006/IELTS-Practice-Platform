'use client'

import { useMemo, useState } from 'react'
import { TIP_SKILL, TIP_TYPE_LABEL, type TipArticle, type TipSkill, type TipType } from '@/lib/tips/articles'
import { TipCard } from '@/components/tips/TipCard'

const SKILL_TABS: { v: 'all' | TipSkill; label: string }[] = [
  { v: 'all', label: 'Tất cả' },
  { v: 'reading', label: 'Reading' },
  { v: 'listening', label: 'Listening' },
  { v: 'writing', label: 'Writing' },
  { v: 'speaking', label: 'Speaking' },
]
const TYPE_CHIPS: { v: 'all' | TipType; label: string }[] = [
  { v: 'all', label: 'Mọi dạng' },
  { v: 'strategy', label: TIP_TYPE_LABEL.strategy },
  { v: 'qtype', label: TIP_TYPE_LABEL.qtype },
]

// Lọc client (bài tĩnh): SSR render toàn bộ để SEO, JS lọc theo kỹ năng + dạng.
export function TipsExplorer({ articles }: { articles: TipArticle[] }) {
  const [skill, setSkill] = useState<'all' | TipSkill>('all')
  const [type, setType] = useState<'all' | TipType>('all')

  const visible = useMemo(
    () => articles.filter((a) => (skill === 'all' || a.skill === skill) && (type === 'all' || a.type === type)),
    [articles, skill, type],
  )

  return (
    <div>
      <div className="mt-10 flex flex-wrap items-center gap-2.5">
        {SKILL_TABS.map((t) => {
          const active = skill === t.v
          return (
            <button
              key={t.v}
              type="button"
              aria-pressed={active}
              onClick={() => setSkill(t.v)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-[15px] py-2 text-[14px] font-bold transition ${
                active
                  ? 'bg-[#2A2740] text-white shadow-[0_10px_22px_-12px_rgba(42,39,64,0.5)]'
                  : 'border border-[#E8E2F0] bg-white text-[#3D3654] hover:border-[#D9D2E6]'
              }`}
            >
              {t.v !== 'all' && (
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rotate-45 rounded-[3px]"
                  style={{ background: TIP_SKILL[t.v].color }}
                />
              )}
              {t.label}
            </button>
          )
        })}

        <span className="mx-1 h-[26px] w-px bg-[#E4DCEE]" />

        {TYPE_CHIPS.map((c) => {
          const active = type === c.v
          return (
            <button
              key={c.v}
              type="button"
              aria-pressed={active}
              onClick={() => setType(c.v)}
              className={`inline-flex min-h-[44px] items-center rounded-[12px] px-[14px] py-2 text-[13.5px] font-bold transition ${
                active
                  ? 'border border-[#D9CFFA] bg-[#F0ECFF] text-[#6A48D6]'
                  : 'border border-[#E8E2F0] bg-white text-[#6A6480] hover:border-[#D9D2E6]'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <p className="mt-[18px] text-[13.5px] font-bold text-[var(--text-subtle)]" aria-live="polite">
        {visible.length} bài viết
      </p>

      {visible.length === 0 ? (
        <p className="mt-12 mb-[72px] text-center text-[15px] font-semibold text-[var(--text-subtle)]">
          Chưa có bài viết khớp bộ lọc.
        </p>
      ) : (
        <div className="mb-[72px] mt-[18px] grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {visible.map((a) => (
            <TipCard key={a.slug} article={a} />
          ))}
        </div>
      )}
    </div>
  )
}
