'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const SKILLS = [
  { v: '', l: 'Tất cả kỹ năng' },
  { v: 'reading', l: 'Reading' },
  { v: 'listening', l: 'Listening' },
  { v: 'writing', l: 'Writing' },
]
const SORTS = [
  { v: 'new', l: 'Mới nhất' },
  { v: 'hot', l: 'Nhiều lượt làm' },
]

// Filter UI skeleton — URL-driven (server page đọc searchParams, không fetch client).
export function CatalogFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')

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
    <div className="flex flex-wrap items-center gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          push({ q: q || undefined })
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm bộ đề..."
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-teal-600"
        />
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">Tìm</button>
      </form>

      <select
        value={sp.get('skill') ?? ''}
        onChange={(e) => push({ skill: e.target.value || undefined })}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        {SKILLS.map((s) => (
          <option key={s.v} value={s.v}>{s.l}</option>
        ))}
      </select>

      <select
        value={sp.get('sort') ?? 'new'}
        onChange={(e) => push({ sort: e.target.value })}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        {SORTS.map((s) => (
          <option key={s.v} value={s.v}>{s.l}</option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={sp.get('free') === '1'}
          onChange={(e) => push({ free: e.target.checked ? '1' : undefined })}
        />
        Có đề free
      </label>
    </div>
  )
}
