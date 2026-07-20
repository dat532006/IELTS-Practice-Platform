'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { SkillTile, type SkillKey } from '@/components/brand/skill'
import { SearchIcon, ChevronDownIcon } from '@/components/brand/icons'

const SKILL_CHIPS: { v: string; label: string; skill?: SkillKey }[] = [
  { v: '', label: 'Tất cả kỹ năng' },
  { v: 'reading', label: 'Reading', skill: 'reading' },
  { v: 'listening', label: 'Listening', skill: 'listening' },
  { v: 'writing', label: 'Writing', skill: 'writing' },
]
const SORTS = [
  { v: 'new', l: 'Mới nhất' },
  { v: 'hot', l: 'Nhiều lượt làm' },
]
const DIFFICULTIES = [
  { v: '', l: 'Mọi độ khó' },
  { v: '1', l: 'Dễ' },
  { v: '2', l: 'Trung bình' },
  { v: '3', l: 'Khó' },
]

// Filter UI — URL-driven (server page đọc searchParams, không fetch client).
export function CatalogFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')

  const activeSkill = sp.get('skill') ?? ''
  const freeOnly = sp.get('free') === '1'

  function push(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    params.delete('page') // reset trang khi đổi filter
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* search + sort */}
      <div className="flex flex-wrap gap-3">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            push({ q: q || undefined })
          }}
          className="flex min-w-[260px] flex-1 items-center gap-2.5 rounded-[13px] border border-[#E8E2F0] bg-white px-4 shadow-[0_6px_16px_rgba(42,39,64,0.04)] focus-within:border-[#7C5CE6]"
        >
          <span className="flex flex-none text-[var(--text-placeholder)]">
            <SearchIcon />
          </span>
          <label htmlFor="catalog-search" className="sr-only">Tìm bộ đề</label>
          <input
            id="catalog-search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm bộ đề — vd Academic Reading"
            className="min-w-0 flex-1 border-none bg-transparent py-[13px] text-[14.5px] text-[#2A2740] outline-none placeholder:text-[var(--text-placeholder)]"
          />
        </form>

        <label className="relative flex items-center gap-2 rounded-[13px] border border-[#E8E2F0] bg-white pl-4 pr-9 text-[14px] font-bold text-[#2A2740] shadow-[0_6px_16px_rgba(42,39,64,0.04)]">
          <span className="font-semibold text-[var(--text-subtle)]">Sắp xếp:</span>
          <select
            aria-label="Sắp xếp bộ đề"
            value={sp.get('sort') ?? 'new'}
            onChange={(e) => push({ sort: e.target.value })}
            className="cursor-pointer appearance-none bg-transparent py-3 pr-1 font-bold text-[#2A2740] outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3.5 text-[var(--text-subtle)]">
            <ChevronDownIcon />
          </span>
        </label>
      </div>

      {/* skill chips + filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        {SKILL_CHIPS.map((c) => {
          const active = activeSkill === c.v
          return (
            <button
              key={c.v}
              onClick={() => push({ skill: c.v || undefined })}
              className={`inline-flex items-center gap-2 min-h-[44px] rounded-[11px] px-3.5 py-[9px] text-[13.5px] font-bold transition ${
                active
                  ? 'bg-[#2A2740] text-white shadow-[0_8px_18px_-8px_rgba(42,39,64,0.5)]'
                  : 'border border-[#E8E2F0] bg-white text-[#3D3654] hover:border-[#D9D2E6]'
              }`}
            >
              {c.skill && <SkillTile skill={c.skill} />}
              {c.label}
            </button>
          )
        })}

        <span
          title="Ngoài scope v1"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[11px] border border-[#EDE8F3] bg-[#F7F5FB] px-3.5 py-[9px] text-[13.5px] font-bold text-[var(--text-subtle)]"
        >
          Speaking
          <span className="rounded-[4px] bg-[#EFEBF4] px-[5px] py-0.5 text-[8.5px] font-extrabold uppercase text-[var(--text-subtle)]">
            soon
          </span>
        </span>

        <span className="mx-1 h-[22px] w-px bg-[#E4DEEE]" />

        <label className="relative inline-flex items-center gap-1.5 rounded-[11px] border border-[#E8E2F0] bg-white pl-3.5 pr-8 text-[13.5px] font-bold text-[#3D3654]">
          <select
            aria-label="Lọc theo độ khó"
            value={sp.get('difficulty') ?? ''}
            onChange={(e) => push({ difficulty: e.target.value || undefined })}
            className="cursor-pointer appearance-none bg-transparent py-[9px] pr-1 font-bold text-[#3D3654] outline-none"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.v} value={d.v}>
                {d.l}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 text-[var(--text-subtle)]">
            <ChevronDownIcon size={14} />
          </span>
        </label>

        <button
          onClick={() => push({ free: freeOnly ? undefined : '1' })}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-[11px] border border-[#E8E2F0] bg-white px-3.5 py-2 text-[13.5px] font-bold text-[#3D3654]"
        >
          Chỉ đề free
          <span
            className={`relative inline-block h-5 w-[34px] rounded-full transition ${
              freeOnly ? 'bg-[#7C5CE6]' : 'bg-[#E4DEEE]'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform ${
                freeOnly ? 'translate-x-[14px]' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  )
}
