'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TIP_SKILL, TIP_TYPE_LABEL, type TipSkill, type TipType } from '@/lib/tips/articles'

export type AdminTipRow = {
  id: string
  slug: string
  skill: TipSkill
  type: TipType
  title: string
  status: 'draft' | 'published'
  sort_order: number
  featured: boolean
}

export function AdminTipsList({ rows }: { rows: AdminTipRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const headCbRef = useRef<HTMLInputElement>(null)

  // Giữ selection hợp lệ khi danh sách đổi (sau refresh) — bỏ id không còn tồn tại.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const live = new Set(rows.map((r) => r.id))
      const next = new Set<string>()
      for (const id of prev) if (live.has(id)) next.add(id)
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && !allSelected

  // Checkbox "chọn tất cả": trạng thái indeterminate khi chọn một phần.
  useEffect(() => {
    if (headCbRef.current) headCbRef.current.indeterminate = someSelected
  }, [someSelected])

  const selectedTitles = useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => r.title),
    [rows, selected],
  )

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
  }

  async function act(id: string, init: RequestInit) {
    setError('')
    setBusyId(id)
    try {
      const r = await fetch(`/api/admin/tips/${id}`, init)
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setError((j?.message as string) || 'Thao tác thất bại.')
      } else {
        router.refresh()
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setBusyId(null)
    }
  }

  const togglePublish = (row: AdminTipRow) =>
    act(row.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: row.status === 'published' ? 'draft' : 'published' }),
    })

  function remove(row: AdminTipRow) {
    if (!window.confirm(`Xoá bài "${row.title}"? Không thể hoàn tác.`)) return
    void act(row.id, { method: 'DELETE' })
  }

  async function removeSelected() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const preview = selectedTitles.slice(0, 5).map((t) => `• ${t}`).join('\n')
    const more = ids.length > 5 ? `\n…và ${ids.length - 5} bài khác` : ''
    if (!window.confirm(`Xoá ${ids.length} bài đã chọn? Không thể hoàn tác.\n\n${preview}${more}`)) return
    setError('')
    setBulkBusy(true)
    try {
      const r = await fetch('/api/admin/tips', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setError((j?.message as string) || 'Không xoá được các bài đã chọn.')
      } else {
        setSelected(new Set())
        router.refresh()
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-5 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-sm font-semibold text-[#6A48D6] underline">
          ← Dashboard
        </Link>
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Bài viết Tips</h1>
        <Link
          href="/admin/tips/new"
          className="ml-auto rounded-[11px] bg-[#7C5CE6] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#6A48D6]"
        >
          + Bài mới
        </Link>
      </div>

      {error && <p className="mb-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Thanh thao tác hàng loạt — hiện khi có bài được chọn. */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#E4DEEE] bg-[#F8F6FF] px-4 py-3">
          <span className="text-[13.5px] font-bold text-[#3D3654]">Đã chọn {selected.size} bài</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[12.5px] font-bold text-[#6A48D6] underline"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={removeSelected}
            disabled={bulkBusy}
            className="ml-auto rounded-[10px] bg-rose-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {bulkBusy ? 'Đang xoá…' : `Xoá đã chọn (${selected.size})`}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-[var(--text-subtle)]">Chưa có bài viết nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#EDE9F2] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[var(--text-subtle)]">
                <th className="w-10 py-2.5 pr-2">
                  <input
                    ref={headCbRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Chọn tất cả bài viết"
                    className="h-4 w-4 cursor-pointer accent-[#7C5CE6]"
                  />
                </th>
                <th className="py-2.5 pr-3">Tiêu đề</th>
                <th className="py-2.5 pr-3">Kỹ năng · Dạng</th>
                <th className="py-2.5 pr-3">Thứ tự</th>
                <th className="py-2.5 pr-3">Trạng thái</th>
                <th className="py-2.5 pr-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busyId === row.id
                const checked = selected.has(row.id)
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-[#F2EFF7] align-middle ${checked ? 'bg-[#F8F6FF]' : ''}`}
                  >
                    <td className="py-3 pr-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(row.id)}
                        aria-label={`Chọn bài ${row.title}`}
                        className="h-4 w-4 cursor-pointer accent-[#7C5CE6]"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2">
                        <Link href={`/admin/tips/${row.id}`} className="font-bold text-[#2A2740] hover:text-[#6A48D6]">
                          {row.title}
                        </Link>
                        {row.featured && (
                          <span className="rounded-full bg-[#F0ECFF] px-2 py-0.5 text-[11px] font-extrabold text-[#6A48D6]">★ Nổi bật</span>
                        )}
                      </span>
                      <div className="text-[12px] font-semibold text-[var(--text-subtle)]">/tips/{row.slug}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="font-semibold" style={{ color: TIP_SKILL[row.skill].text }}>
                        {TIP_SKILL[row.skill].label}
                      </span>
                      <span className="text-[var(--text-subtle)]"> · {TIP_TYPE_LABEL[row.type]}</span>
                    </td>
                    <td className="py-3 pr-3 tabular-nums text-[var(--text-muted)]">{row.sort_order}</td>
                    <td className="py-3 pr-3">
                      {row.status === 'published' ? (
                        <span className="rounded-full bg-[#EAF9F0] px-2.5 py-1 text-[12px] font-bold text-[#1E7A48]">Đã đăng</span>
                      ) : (
                        <span className="rounded-full bg-[#F2EFF7] px-2.5 py-1 text-[12px] font-bold text-[var(--text-subtle)]">Nháp</span>
                      )}
                    </td>
                    <td className="py-3 pr-0">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => togglePublish(row)}
                          disabled={busy}
                          className="rounded-[9px] border border-[#E4DEEE] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#3D3654] transition hover:border-[#D9D2E6] disabled:opacity-50"
                        >
                          {row.status === 'published' ? 'Ẩn' : 'Đăng'}
                        </button>
                        <Link
                          href={`/admin/tips/${row.id}`}
                          className="rounded-[9px] border border-[#E4DEEE] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#3D3654] transition hover:border-[#D9D2E6]"
                        >
                          Sửa
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          disabled={busy}
                          className="rounded-[9px] border border-rose-200 bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
