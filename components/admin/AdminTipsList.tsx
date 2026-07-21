'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TIP_SKILL, TIP_TYPE_LABEL, type TipSkill, type TipType } from '@/lib/tips/articles'

export type AdminTipRow = {
  id: string
  slug: string
  skill: TipSkill
  type: TipType
  title: string
  status: 'draft' | 'published'
  sort_order: number
}

export function AdminTipsList({ rows }: { rows: AdminTipRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

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

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-[var(--text-subtle)]">Chưa có bài viết nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#EDE9F2] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[var(--text-subtle)]">
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
                return (
                  <tr key={row.id} className="border-b border-[#F2EFF7] align-middle">
                    <td className="py-3 pr-3">
                      <Link href={`/admin/tips/${row.id}`} className="font-bold text-[#2A2740] hover:text-[#6A48D6]">
                        {row.title}
                      </Link>
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
