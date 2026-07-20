'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FishBone } from '@/components/brand/FishBone'

// Admin danh sách người dùng (M11 mở rộng, 2026-07-12). Client gọi API; guard THẬT ở server.
//   DTO nghiệp vụ: email/tên/coins/role/plan/ngày tạo/số VOL — KHÔNG token/secret.
type UserRow = {
  id: string
  email: string | null
  name: string | null
  coins: number
  role: string
  plan: string
  created_at: string
  unlock_count: number
}

const inputCls =
  'rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return s
  }
}

export function AdminUserList() {
  const [items, setItems] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [q, setQ] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(false)
  // UI-005: chống response cũ ghi đè bộ lọc mới hơn. Mỗi load tăng reqId; chỉ áp kết quả nếu vẫn là load
  //   mới nhất. acRef hủy request cũ đang bay (tránh phí + swallow lỗi do chính mình hủy).
  const reqIdRef = useRef(0)
  const acRef = useRef<AbortController | null>(null)

  const load = useCallback(async (p: number, query: string) => {
    const myId = ++reqIdRef.current
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac
    setLoadErr('')
    setLoading(true)
    const sp = new URLSearchParams()
    if (query.trim()) sp.set('q', query.trim())
    sp.set('page', String(p))
    sp.set('per_page', '20')
    try {
      const r = await fetch(`/api/admin/users?${sp}`, { signal: ac.signal })
      const j = await r.json().catch(() => null)
      if (myId !== reqIdRef.current) return // đã có load mới hơn → bỏ kết quả cũ
      if (r.ok && j?.data) {
        setItems(j.data.items as UserRow[])
        setTotal(j.data.total as number)
        setPage(j.data.page as number)
      } else if (r.status === 403) setLoadErr('Bạn không có quyền admin.')
      else setLoadErr('Không tải được danh sách người dùng.')
    } catch {
      if (ac.signal.aborted || myId !== reqIdRef.current) return // bị load mới hủy → im lặng
      setLoadErr('Lỗi kết nối.')
    } finally {
      if (myId === reqIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(1, '')
  }, [load])

  const pages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Người dùng ({total})</h1>
      <p className="mt-1 text-[13.5px] font-semibold text-[var(--text-muted)]">
        Tài khoản đã đăng ký. Bấm vào email để xem hồ sơ: gói sở hữu, giao dịch, lịch sử làm bài.
      </p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          void load(1, q)
        }}
      >
        <input className={`${inputCls} w-72`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo email / tên…" />
        <button type="submit" className="rounded-[11px] bg-[#F4F1FB] px-4 py-2.5 text-sm font-bold text-[#2A2740] hover:bg-[#EAE4F6]">
          Tìm
        </button>
      </form>

      {loadErr && <p role="alert" className="mt-4 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-[#ECE9F2] text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Tên</th>
              <th className="px-3 py-2.5 text-right">Xương cá</th>
              <th className="px-3 py-2.5 text-center">VOL sở hữu</th>
              <th className="px-3 py-2.5 text-center">Vai trò</th>
              <th className="px-3 py-2.5">Ngày đăng ký</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-[var(--text-subtle)]">Đang tải…</td>
              </tr>
            )}
            {!loading && items.length === 0 && !loadErr && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-[var(--text-subtle)]">
                  Không có tài khoản nào khớp tìm kiếm.
                </td>
              </tr>
            )}
            {items.map((u) => (
              <tr key={u.id} className="border-b border-[#F3F1F8] hover:bg-[#FBFAFE]">
                <td className="px-3 py-2.5">
                  <Link href={`/admin/users/${u.id}`} className="font-bold text-[#2A2740] hover:text-[#6A48D6] hover:underline">
                    {u.email ?? '(không có email)'}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[#564F6B]">{u.name ?? '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1 font-mono font-bold">
                    {u.coins} <FishBone />
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center font-bold">{u.unlock_count}</td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${
                      u.role === 'admin' ? 'bg-[#F0ECFF] text-[#5B43C7]' : 'bg-[#EFEBF2] text-[#8B8398]'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]">{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm font-bold">
          <button type="button" disabled={page <= 1} onClick={() => void load(page - 1, q)} className="rounded-[9px] border border-[#E4DEEE] px-3 py-1.5 disabled:opacity-40">
            ← Trước
          </button>
          <span className="text-[var(--text-muted)]">
            Trang {page}/{pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => void load(page + 1, q)} className="rounded-[9px] border border-[#E4DEEE] px-3 py-1.5 disabled:opacity-40">
            Sau →
          </button>
        </div>
      )}
    </div>
  )
}
