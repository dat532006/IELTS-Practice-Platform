'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W17 — Lịch sử làm bài (M09). Gating Free 10 / Pro full ENFORCE Ở SERVER (/api/attempts). Client chỉ hiển thị.
type TestRef = { title: string | null; type: string | null; slug: string | null } | null
type AttemptRow = {
  id: string
  status: string
  band: number | null
  raw_score: number | null
  duration_sec: number | null
  submitted_at: string | null
  started_at: string | null
  tests: TestRef
}
type AttemptsData = { plan: string; limited: boolean; limit: number; total: number; items: AttemptRow[] }

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const skillLabel = (t: string | null) => (t === 'reading' ? 'Reading' : t === 'listening' ? 'Listening' : t === 'writing' ? 'Writing' : '—')
const statusLabel = (s: string) => (s === 'submitted' ? 'Đã nộp' : s === 'expired' ? 'Hết giờ' : 'Đang làm')

export default function HistoryPage() {
  const [data, setData] = useState<AttemptsData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'unauth' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/attempts')
        if (res.status === 401) return alive && setState('unauth')
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.data) return alive && setState('error')
        if (alive) { setData(body.data as AttemptsData); setState('ok') }
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => { alive = false }
  }, [])

  if (state === 'loading') return <p className="text-[14px] text-[#857F96]">Đang tải…</p>
  if (state === 'unauth')
    return (
      <p className="text-[14px] text-[#857F96]">
        Bạn cần <Link href="/login" className="font-bold text-[#6A48D6] underline">đăng nhập</Link> để xem lịch sử.
      </p>
    )
  if (state === 'error' || !data) return <p className="text-[14px] text-rose-600">Không tải được lịch sử. Vui lòng thử lại.</p>

  return (
    <div>
      {data.limited && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E6DEFA] bg-[#F6F2FF] px-5 py-3.5">
          <span className="text-[13.5px] font-semibold text-[#5B43C7]">
            Đang xem {data.items.length} bài gần nhất trong tổng số {data.total}. Nâng cấp <b>Pro</b> để xem toàn bộ lịch sử.
          </span>
          <Link href="/pricing" className="rounded-[10px] bg-[#7C5CE6] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#6A48D6]">
            Nâng cấp Pro
          </Link>
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="text-[14px] text-[#857F96]">Chưa có bài làm nào. <Link href="/products" className="font-bold text-[#6A48D6] underline">Bắt đầu luyện tập →</Link></p>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-[#EEEAF3] bg-white">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-[#FBFAFF] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
              <tr>
                <th className="px-5 py-3">Bài</th>
                <th className="px-3 py-3">Kỹ năng</th>
                <th className="px-3 py-3">Ngày</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1EEF7]">
              {data.items.map((a) => (
                <tr key={a.id} className="hover:bg-[#FBFAFF]">
                  <td className="px-5 py-3 font-bold text-[#2A2740]">{a.tests?.title || 'Bài luyện tập'}</td>
                  <td className="px-3 py-3 text-[#5C5670]">{skillLabel(a.tests?.type ?? null)}</td>
                  <td className="px-3 py-3 text-[#857F96]">{fmtDate(a.submitted_at || a.started_at)}</td>
                  <td className="px-3 py-3 text-[#857F96]">{statusLabel(a.status)}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-[#6A48D6]">{a.band != null ? a.band.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
