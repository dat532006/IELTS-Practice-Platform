'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W17 — Dashboard tổng quan (M09). Fetch /api/dashboard (server tính, RLS own-only). KHÔNG tự suy dữ liệu client.
type TestRef = { title: string | null; type: string | null; slug: string | null } | null
type RecentAttempt = {
  id: string
  status: string
  band: number | null
  raw_score: number | null
  submitted_at: string | null
  started_at: string | null
  tests: TestRef
}
type DashboardData = {
  profile: { name: string | null; email: string | null; plan: string; coins: number }
  stats: {
    attempts_total: number
    attempts_submitted: number
    avg_band: number | null
    owned_products: number
    vocab_count: number
    bookmarks_count: number
  }
  recent_attempts: RecentAttempt[]
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const skillLabel = (t: string | null) => (t === 'reading' ? 'Reading' : t === 'listening' ? 'Listening' : t === 'writing' ? 'Writing' : '—')

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[16px] border border-[#EEEAF3] bg-white px-5 py-4 shadow-[0_6px_16px_rgba(42,39,64,0.04)]">
      <div className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#9088A2]">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] text-[#2A2740]">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] font-semibold text-[#A8A2BA]">{hint}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'unauth' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard')
        if (res.status === 401) return alive && setState('unauth')
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.data) return alive && setState('error')
        if (alive) { setData(body.data as DashboardData); setState('ok') }
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
        Bạn cần <Link href="/login" className="font-bold text-[#6A48D6] underline">đăng nhập</Link> để xem bảng điều khiển.
      </p>
    )
  if (state === 'error' || !data) return <p className="text-[14px] text-rose-600">Không tải được dữ liệu. Vui lòng thử lại.</p>

  const { profile, stats, recent_attempts } = data
  return (
    <div>
      {/* Header card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#EEEAF3] bg-[#FBFAFF] px-6 py-5">
        <div>
          <div className="text-[18px] font-extrabold text-[#2A2740]">Chào {profile.name || profile.email || 'bạn'} 👋</div>
          <div className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-[#857F96]">
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${profile.plan === 'pro' ? 'bg-[#F0ECFF] text-[#6A48D6]' : 'bg-[#EEF0F4] text-[#6B7280]'}`}>
              {profile.plan === 'pro' ? 'PRO' : 'FREE'}
            </span>
            <span>· 🪙 {profile.coins} coins</span>
          </div>
        </div>
        <Link
          href="/pricing"
          className="rounded-[12px] bg-[#7C5CE6] px-4 py-2.5 text-[14px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(124,92,230,0.5)] hover:bg-[#6A48D6]"
        >
          Nạp coin
        </Link>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Đã làm" value={String(stats.attempts_total)} hint={`${stats.attempts_submitted} đã nộp`} />
        <StatCard label="Band TB" value={stats.avg_band != null ? stats.avg_band.toFixed(1) : '—'} hint="các bài đã nộp" />
        <StatCard label="Sản phẩm sở hữu" value={String(stats.owned_products)} />
        <StatCard label="Từ vựng" value={String(stats.vocab_count)} />
        <StatCard label="Đã lưu" value={String(stats.bookmarks_count)} hint="bookmark" />
      </div>

      {/* Recent */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold text-[#2A2740]">Hoạt động gần đây</h2>
          <Link href="/dashboard/history" className="text-[13px] font-bold text-[#6A48D6] hover:underline">Xem tất cả →</Link>
        </div>
        {recent_attempts.length === 0 ? (
          <p className="mt-3 text-[14px] text-[#857F96]">Chưa có bài làm nào. <Link href="/products" className="font-bold text-[#6A48D6] underline">Bắt đầu luyện tập →</Link></p>
        ) : (
          <ul className="mt-3 divide-y divide-[#F1EEF7] rounded-[16px] border border-[#EEEAF3] bg-white">
            {recent_attempts.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[14px] font-bold text-[#2A2740]">{a.tests?.title || 'Bài luyện tập'}</div>
                  <div className="mt-0.5 text-[12.5px] font-semibold text-[#A8A2BA]">
                    {skillLabel(a.tests?.type ?? null)} · {fmtDate(a.submitted_at || a.started_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] font-extrabold text-[#6A48D6]">{a.band != null ? `Band ${a.band.toFixed(1)}` : a.status === 'submitted' ? '—' : 'Đang làm'}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
