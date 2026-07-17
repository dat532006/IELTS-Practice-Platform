'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type TestRef = { title: string | null; type: string | null; slug: string | null } | null
type AttemptRow = {
  id: string
  status: string
  band: number | null
  raw_score: number | null
  duration_sec: number | null
  submitted_at: string | null
  started_at: string | null
  result_href: string | null
  tests: TestRef
}
type AttemptsData = { plan: string; limited: boolean; limit: number; total: number; items: AttemptRow[] }

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const skillLabel = (type: string | null) =>
  type === 'reading' ? 'Reading' : type === 'listening' ? 'Listening' : type === 'writing' ? 'Writing' : '—'
const statusLabel = (status: string) => (status === 'submitted' ? 'Đã nộp' : status === 'expired' ? 'Hết giờ' : 'Đang làm')

function ResultLink({ attempt, fullWidth = false }: { attempt: AttemptRow; fullWidth?: boolean }) {
  if (!attempt.result_href) {
    return <span className="text-[12px] font-semibold text-[#B0A9BE]">Chưa có chi tiết</span>
  }
  return (
    <Link
      href={attempt.result_href}
      className={`inline-flex items-center justify-center rounded-[10px] border border-[#DDD3F2] bg-[#F8F5FF] px-3 py-2 text-[12.5px] font-extrabold text-[#6549C9] transition hover:border-[#C8B8EA] hover:bg-[#F0EAFF] ${
        fullWidth ? 'w-full' : ''
      }`}
      aria-label={`Xem chi tiết kết quả ${attempt.tests?.title || 'bài luyện tập'}`}
    >
      Xem chi tiết →
    </Link>
  )
}

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
        if (alive) {
          setData(body.data as AttemptsData)
          setState('ok')
        }
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (state === 'loading') return <p className="text-[14px] text-[#857F96]">Đang tải…</p>
  if (state === 'unauth')
    return (
      <p className="text-[14px] text-[#857F96]">
        Bạn cần{' '}
        <Link href="/login" className="font-bold text-[#6A48D6] underline">
          đăng nhập
        </Link>{' '}
        để xem lịch sử.
      </p>
    )
  if (state === 'error' || !data) return <p className="text-[14px] text-rose-600">Không tải được lịch sử. Vui lòng thử lại.</p>

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-[#2A2740]">Lịch sử làm bài</h2>
        <p className="mt-1 text-[13px] font-medium text-[#8D869D]">Mở lại điểm số, nhận xét và bài sửa chi tiết của từng lần chấm.</p>
      </div>

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
        <p className="text-[14px] text-[#857F96]">
          Chưa có bài làm nào.{' '}
          <Link href="/products" className="font-bold text-[#6A48D6] underline">
            Bắt đầu luyện tập →
          </Link>
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-[16px] border border-[#EEEAF3] bg-white md:block">
            <table className="w-full min-w-[820px] text-left text-[13.5px]">
              <thead className="bg-[#FBFAFF] text-[12px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
                <tr>
                  <th className="px-5 py-3">Bài</th>
                  <th className="px-3 py-3">Kỹ năng</th>
                  <th className="px-3 py-3">Ngày</th>
                  <th className="px-3 py-3">Trạng thái</th>
                  <th className="px-3 py-3 text-right">Band</th>
                  <th className="px-5 py-3 text-right">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1EEF7]">
                {data.items.map((attempt) => (
                  <tr key={attempt.id} className="transition hover:bg-[#FBFAFF]">
                    <td className="max-w-[280px] px-5 py-3 font-bold text-[#2A2740]">
                      <span className="line-clamp-2">{attempt.tests?.title || 'Bài luyện tập'}</span>
                    </td>
                    <td className="px-3 py-3 text-[#5C5670]">{skillLabel(attempt.tests?.type ?? null)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#857F96]">{fmtDate(attempt.submitted_at || attempt.started_at)}</td>
                    <td className="px-3 py-3 text-[#857F96]">{statusLabel(attempt.status)}</td>
                    <td className="px-3 py-3 text-right font-extrabold text-[#6A48D6]">{attempt.band != null ? attempt.band.toFixed(1) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <ResultLink attempt={attempt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.items.map((attempt) => (
              <li key={attempt.id} className="rounded-[16px] border border-[#EEEAF3] bg-white p-4 shadow-[0_8px_20px_-18px_rgba(42,39,64,0.5)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-[#F0ECFF] px-2 py-0.5 text-[10.5px] font-extrabold text-[#6A48D6]">
                        {skillLabel(attempt.tests?.type ?? null)}
                      </span>
                      <span className="rounded-full bg-[#F3F1F5] px-2 py-0.5 text-[10.5px] font-bold text-[#7B748A]">
                        {statusLabel(attempt.status)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-[14px] font-extrabold leading-snug text-[#2A2740]">{attempt.tests?.title || 'Bài luyện tập'}</h3>
                    <p className="mt-1 text-[12px] font-semibold text-[#9C95AA]">{fmtDate(attempt.submitted_at || attempt.started_at)}</p>
                  </div>
                  <span className="flex-none rounded-[12px] bg-[#F7F3FF] px-3 py-2 text-[16px] font-extrabold text-[#6A48D6]">
                    {attempt.band != null ? attempt.band.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="mt-3 border-t border-[#F0ECF5] pt-3">
                  <ResultLink attempt={attempt} fullWidth />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
