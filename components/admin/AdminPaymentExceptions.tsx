'use client'

import { useCallback, useEffect, useState } from 'react'

// PAY-004 — Bảng đối soát: list case + resolve/ignore. Guard THẬT ở server (/api/admin/* requireAdmin).
//   KHÔNG credit ở client. detail chỉ số tiền (server không trả secret).
type ExceptionRow = {
  id: string
  provider: string
  provider_txn_id: string | null
  kind: string
  paid_vnd: number | null
  expected_vnd: number | null
  status: string
  resolution_note: string | null
  resolved_at: string | null
  created_at: string
}

const vnd = (n: number | null) => (n == null ? '—' : n.toLocaleString('vi-VN') + '₫')

export function AdminPaymentExceptions() {
  const [items, setItems] = useState<ExceptionRow[]>([])
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const qs = filter === 'open' ? '?status=open' : ''
      const res = await fetch(`/api/admin/payments/exceptions${qs}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.message ?? 'Không tải được danh sách')
      setItems(body?.data?.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi tải danh sách')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void load() }, [load])

  async function resolve(id: string, status: 'resolved' | 'ignored') {
    const note = window.prompt(status === 'resolved' ? 'Ghi chú đối soát (đã xử lý):' : 'Lý do bỏ qua case:') ?? ''
    let coinDelta = 0
    if (status === 'resolved') {
      const rawDelta = window.prompt('Coin delta to apply (non-zero integer; use negative to debit):')
      if (rawDelta == null) return
      coinDelta = Number(rawDelta)
      if (!Number.isInteger(coinDelta) || coinDelta === 0) {
        setErr('Coin delta must be a non-zero integer')
        return
      }
    }
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/payments/exceptions/${id}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note, coin_delta: coinDelta }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        throw new Error(b?.message ?? 'Không đóng được case')
      }
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi đóng case')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('open')}
          className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold ${filter === 'open' ? 'bg-[#2A2740] text-white' : 'bg-[#F2EFF7] text-[#6A6480]'}`}
        >
          Đang mở
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold ${filter === 'all' ? 'bg-[#2A2740] text-white' : 'bg-[#F2EFF7] text-[#6A6480]'}`}
        >
          Tất cả
        </button>
        <button type="button" onClick={() => void load()} className="ml-auto rounded-[8px] bg-[#F2EFF7] px-3 py-1.5 text-[13px] font-semibold text-[#6A6480]">
          Tải lại
        </button>
      </div>

      {err && <p className="mb-3 rounded-[8px] bg-[#FDECEC] px-3 py-2 text-[13px] text-[#C0392B]" role="alert">{err}</p>}
      {loading ? (
        <p className="text-[13px] text-[#6A6480]">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="rounded-[10px] border border-[#EBE8F1] bg-white px-4 py-6 text-center text-[13px] text-[#6A6480]">
          Không có case nào.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-[#EBE8F1] bg-white">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-[#EBE8F1] text-[12px] text-[#857F96]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Thời gian</th>
                <th className="px-3 py-2.5 font-semibold">Cổng / Mã</th>
                <th className="px-3 py-2.5 font-semibold">Loại</th>
                <th className="px-3 py-2.5 font-semibold">Đã trả</th>
                <th className="px-3 py-2.5 font-semibold">Kỳ vọng</th>
                <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-3 py-2.5 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-[#F4F2F8] last:border-0">
                  <td className="px-3 py-2.5 text-[#6A6480]">{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">{r.provider} · {r.provider_txn_id ?? '—'}</td>
                  <td className="px-3 py-2.5">{r.kind}</td>
                  <td className="px-3 py-2.5">{vnd(r.paid_vnd)}</td>
                  <td className="px-3 py-2.5">{vnd(r.expected_vnd)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${r.status === 'open' ? 'bg-[#FDECEC] text-[#C0392B]' : 'bg-[#E7F7EE] text-[#1E7A48]'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.status === 'open' ? (
                      <div className="flex gap-1.5">
                        <button type="button" disabled={busy === r.id} onClick={() => void resolve(r.id, 'resolved')} className="rounded-[7px] bg-[#E7F7EE] px-2.5 py-1 text-[12px] font-bold text-[#1E7A48] disabled:opacity-50">
                          Đã xử lý
                        </button>
                        <button type="button" disabled={busy === r.id} onClick={() => void resolve(r.id, 'ignored')} className="rounded-[7px] bg-[#F2EFF7] px-2.5 py-1 text-[12px] font-bold text-[#6A6480] disabled:opacity-50">
                          Bỏ qua
                        </button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#857F96]" title={r.resolution_note ?? ''}>{r.resolution_note ? '📝' : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
