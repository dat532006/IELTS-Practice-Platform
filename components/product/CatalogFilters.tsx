'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { SkillTile, type SkillKey } from '@/components/brand/skill'
import { SearchIcon, ChevronDownIcon } from '@/components/brand/icons'

const SKILL_CHIPS: { v: string; label: string; skill?: SkillKey }[] = [
  { v: '', label: 'Tất cả kỹ năng' },
  { v: 'reading', label: 'Reading', skill: 'reading' },
  { v: 'listening', label: 'Listening', skill: 'listening' },
  { v: 'writing', label: 'Writing', skill: 'writing' },
]
// 'new' = mặc định (created_at desc, KHÔNG gửi param); 'hot'/'az' được lib/products/queries.ts hỗ trợ.
const SORTS: { v: string; l: string }[] = [
  { v: 'new', l: 'Mới nhất' },
  { v: 'hot', l: 'Nhiều lượt làm' },
  { v: 'az', l: 'A → Z' },
]
// text = màu chữ ĐẠT WCAG AA trên nền trắng (amber gốc #ECA22B fail nên chữ dùng #8A5D0A); dot chỉ trang trí.
const DIFFICULTIES: { v: string; l: string; dot?: string; text: string }[] = [
  { v: '', l: 'Mọi độ khó', text: '#2A2740' },
  { v: '1', l: 'Dễ', dot: '#137A4A', text: '#137A4A' },
  { v: '2', l: 'Trung bình', dot: '#ECA22B', text: '#8A5D0A' },
  { v: '3', l: 'Khó', dot: '#B4232F', text: '#B4232F' },
]

// Dropdown thay native <select>: trigger (aria-haspopup=listbox) + menu (role=listbox, option role=option)
// để tuỳ biến menu màu theo độ khó. Đóng khi: chọn / Esc / click ngoài / focus rời khỏi wrapper.
function Dropdown({
  open,
  onToggle,
  onClose,
  ariaLabel,
  trigger,
  align = 'left',
  children,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  ariaLabel: string
  trigger: ReactNode
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        ref.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div
      ref={ref}
      className="relative"
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node)) onClose()
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={onToggle}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border border-[#E8E2F0] bg-white px-4 py-2.5 text-[14px] font-bold text-[#2A2740] shadow-[0_6px_16px_rgba(42,39,64,0.04)] transition hover:border-[#D9D2E6]"
      >
        {trigger}
        <ChevronDownIcon
          size={14}
          className={`text-[var(--text-subtle)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-[calc(100%+8px)] z-30 min-w-[210px] rounded-[14px] border border-[#EEE7F3] bg-white p-1.5 shadow-[0_18px_40px_-14px_rgba(42,39,64,0.32)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// Filter UI — URL-driven (server page đọc searchParams, không fetch client). Thiết kế "1a".
export function CatalogFilters({ total }: { total: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [openMenu, setOpenMenu] = useState<'sort' | 'diff' | null>(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])

  const activeSkill = sp.get('skill') ?? ''
  const activeDiff = sp.get('difficulty') ?? ''
  const activeSort = sp.get('sort') ?? 'new'
  const activeQ = sp.get('q') ?? ''
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

  function reset() {
    setQ('')
    push({ q: undefined, skill: undefined, difficulty: undefined, free: undefined })
  }

  const sortLabel = SORTS.find((s) => s.v === activeSort)?.l ?? SORTS[0].l
  const diffLabel = DIFFICULTIES.find((d) => d.v === activeDiff)?.l ?? DIFFICULTIES[0].l

  const chips: string[] = []
  if (activeSkill) chips.push(SKILL_CHIPS.find((c) => c.v === activeSkill)?.label ?? activeSkill)
  if (activeDiff) chips.push(DIFFICULTIES.find((d) => d.v === activeDiff)?.l ?? activeDiff)
  if (freeOnly) chips.push('Chỉ đề free')
  if (activeQ) chips.push(`“${activeQ}”`)
  const hasFilters = chips.length > 0

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hàng 1: tìm kiếm (co giãn) + sắp xếp */}
      <div className="flex flex-wrap gap-3">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            push({ q: q || undefined })
          }}
          className="field-control flex min-w-[260px] flex-1 items-center gap-2.5 rounded-[14px] border border-[#E8E2F0] bg-white px-4 shadow-[0_6px_16px_rgba(42,39,64,0.04)] focus-within:border-[#7C5CE6]"
        >
          <span className="flex flex-none text-[var(--text-placeholder)]">
            <SearchIcon />
          </span>
          <label htmlFor="catalog-search" className="sr-only">
            Tìm bộ đề
          </label>
          <input
            id="catalog-search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm bộ đề — vd Academic Reading"
            className="min-w-0 flex-1 border-none bg-transparent py-[14px] text-[14.5px] text-[#2A2740] outline-none placeholder:text-[var(--text-placeholder)]"
          />
        </form>

        <Dropdown
          open={openMenu === 'sort'}
          onToggle={() => setOpenMenu((m) => (m === 'sort' ? null : 'sort'))}
          onClose={closeMenu}
          ariaLabel="Sắp xếp bộ đề"
          align="right"
          trigger={
            <>
              <span className="font-semibold text-[var(--text-subtle)]">Sắp xếp:</span>
              <span>{sortLabel}</span>
            </>
          }
        >
          {SORTS.map((s) => {
            const sel = activeSort === s.v
            return (
              <button
                key={s.v}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  push({ sort: s.v === 'new' ? undefined : s.v })
                  closeMenu()
                }}
                className={`flex w-full items-center rounded-[9px] px-3.5 py-2.5 text-left text-[14px] font-bold transition ${
                  sel ? 'bg-[#F0ECFF] text-[#6A48D6]' : 'text-[#3D3654] hover:bg-[#F7F5FB]'
                }`}
              >
                {s.l}
              </button>
            )
          })}
        </Dropdown>
      </div>

      {/* Hàng 2: pill kỹ năng + độ khó + toggle free */}
      <div className="flex flex-wrap items-center gap-2.5">
        {SKILL_CHIPS.map((c) => {
          const active = activeSkill === c.v
          return (
            <button
              key={c.v}
              type="button"
              aria-pressed={active}
              onClick={() => push({ skill: c.v || undefined })}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-[13px] px-3.5 py-[9px] text-[14px] font-bold transition ${
                active
                  ? 'bg-[#2A2740] text-white shadow-[0_10px_22px_-10px_rgba(42,39,64,0.5)]'
                  : 'border border-[#E8E2F0] bg-white text-[#3D3654] hover:border-[#D9D2E6]'
              }`}
            >
              {c.skill && <SkillTile skill={c.skill} tileSize={24} radius={7} glyphSize={15} />}
              {c.label}
            </button>
          )
        })}

        <span
          title="Ngoài scope v1"
          className="inline-flex min-h-[44px] cursor-not-allowed items-center gap-2 rounded-[13px] border border-transparent bg-[#F2EFF5] px-3.5 py-[9px] text-[14px] font-bold text-[var(--text-subtle)]"
        >
          Speaking
          <span className="rounded-[5px] bg-[#E3DDEC] px-1.5 py-0.5 text-[11px] font-extrabold uppercase leading-none tracking-[0.05em] text-[var(--badge-neutral-text)]">
            soon
          </span>
        </span>

        <span className="mx-1 h-[26px] w-px bg-[#E4DCEE]" />

        <Dropdown
          open={openMenu === 'diff'}
          onToggle={() => setOpenMenu((m) => (m === 'diff' ? null : 'diff'))}
          onClose={closeMenu}
          ariaLabel="Lọc theo độ khó"
          trigger={<span>{diffLabel}</span>}
        >
          {DIFFICULTIES.map((d) => {
            const sel = activeDiff === d.v
            return (
              <button
                key={d.v || 'all'}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  push({ difficulty: d.v || undefined })
                  closeMenu()
                }}
                style={sel ? undefined : { color: d.text }}
                className={`flex w-full items-center gap-2.5 rounded-[9px] px-3.5 py-2.5 text-left text-[14px] font-bold transition ${
                  sel ? 'bg-[#7C5CE6] text-white' : 'hover:bg-[#F7F5FB]'
                }`}
              >
                {d.dot && (
                  <span
                    className="inline-block h-2 w-2 flex-none rounded-full"
                    style={{ background: sel ? '#fff' : d.dot }}
                  />
                )}
                {d.l}
              </button>
            )
          })}
        </Dropdown>

        <button
          type="button"
          role="switch"
          aria-checked={freeOnly}
          onClick={() => push({ free: freeOnly ? undefined : '1' })}
          className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-[13px] border px-3.5 py-2 text-[14px] font-bold transition ${
            freeOnly
              ? 'border-[#7C5CE6] bg-[#F3EFFE] text-[#5B43C7]'
              : 'border-[#E8E2F0] bg-white text-[#3D3654] hover:border-[#D9D2E6]'
          }`}
        >
          Chỉ đề free
          <span
            className={`relative inline-block h-[22px] w-[40px] rounded-full transition ${
              freeOnly ? 'bg-[#7C5CE6]' : 'bg-[#E2DCEC]'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform ${
                freeOnly ? 'translate-x-[18px]' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>

      {/* Hàng 3: tóm tắt bộ lọc đang áp dụng */}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-[#F1EDF6] pt-4">
        <span className="text-[13px] font-bold text-[var(--text-subtle)]">Đang lọc</span>
        {hasFilters ? (
          chips.map((c, i) => (
            <span
              key={i}
              className="rounded-full bg-[#F0ECFF] px-3 py-[5px] text-[12.5px] font-bold text-[#6A48D6]"
            >
              {c}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-[#F5F3FA] px-3 py-[5px] text-[12.5px] font-bold text-[var(--text-subtle)]">
            Tất cả bộ đề
          </span>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="-my-1 py-1 text-[12.5px] font-bold text-[var(--text-subtle)] underline transition hover:text-[#2A2740]"
          >
            Xoá lọc
          </button>
        )}
        <span className="ml-auto text-[13px] font-bold text-[#2A2740]">{total} bộ đề</span>
      </div>
    </div>
  )
}
