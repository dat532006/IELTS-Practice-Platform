'use client'

// W8 result view — W9 parity (capture Result.png/Result01.png):
// summary card (Phần thi / Trắc nghiệm / Tổng điểm + donut band) + "Thử lại bài kiểm tra",
// "Chi tiết bài thi" (Đúng/Sai/Bỏ qua + Kết quả/Độ chính xác/Thời gian/Câu đúng),
// "Danh sách câu hỏi" (ReviewList — đáp án đúng vs câu trả lời của bạn).
// LUẬT THÉP #2/#4/#12: mọi số liệu suy ra TỪ ResultDTO (is_correct do server chấm); FE không chấm lại.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SKILL_LABEL } from '@/lib/products/access-state'
import { testEntryPath } from '@/lib/exam/entry-route'
import { ReviewList } from '@/components/result/ReviewList'
import type { ResultDTO, ReviewItem } from '@/types/exam'

type Phase = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error'

function clock(sec: number | null): string {
  const s = Math.max(0, Math.floor(sec ?? 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const isSkipped = (v: ReviewItem['user_answer']): boolean =>
  v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

// Donut band (capture): vòng cung cam theo band/9, số band ở giữa.
function BandDonut({ band }: { band: number | null }) {
  const frac = band != null ? Math.max(0, Math.min(1, band / 9)) : 0
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" role="img" aria-label={band != null ? `Band ${band}` : 'Chưa có band'}>
      <circle cx="60" cy="60" r={R} fill="none" stroke="#E5E7EB" strokeWidth="13" />
      {frac > 0 && (
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="#F2B33D"
          strokeWidth="13"
          strokeLinecap="butt"
          strokeDasharray={`${frac * C} ${C}`}
          transform="rotate(-90 60 60)"
        />
      )}
      <text x="60" y="68" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 700 }}>
        {band != null ? band.toFixed(1) : '—'}
      </text>
    </svg>
  )
}

function StatCircle({ kind, label, value }: { kind: 'correct' | 'wrong' | 'skipped'; label: string; value: number }) {
  const bg = kind === 'correct' ? 'bg-[#34A853]' : kind === 'wrong' ? 'bg-[#EA4335]' : 'bg-[#F29B38]'
  const labelCls = kind === 'correct' ? 'text-[#34A853]' : kind === 'wrong' ? 'text-[#EA4335]' : 'text-[#F29B38]'
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${bg}`}>
        {kind === 'correct' && (
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
        )}
        {kind === 'wrong' && (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        )}
        {kind === 'skipped' && (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M6 5l9 7-9 7V5z" /><rect x="16.5" y="5" width="2.5" height="14" /></svg>
        )}
      </span>
      <span className={`text-sm ${labelCls}`}>{label}</span>
      <span className="font-bold">{value} Câu</span>
    </div>
  )
}

// Capture parity (Result01): thẻ Phân loại/Độ khó/Danh mục/Phần — vòng tròn nhỏ arc xanh lá theo tỉ lệ đúng.
function MiniDonut({ correct, total }: { correct: number; total: number }) {
  const frac = total > 0 ? correct / total : 0
  const R = 9
  const C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r={R} fill="none" stroke="#E5E7EB" strokeWidth="4" />
      {frac > 0 && (
        <circle cx="12" cy="12" r={R} fill="none" stroke="#0E7A43" strokeWidth="4" strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90 12 12)" />
      )}
    </svg>
  )
}

function CategoryCard({ title, label, correct, total }: { title: string; label: string; correct: number; total: number }) {
  return (
    <div className="rounded-2xl border border-[#efebf4] bg-white p-5 shadow-[0_14px_30px_-24px_rgba(42,39,64,0.4)]">
      <h3 className="font-extrabold">{title}</h3>
      <hr className="mt-3 border-slate-100" />
      <div className="mt-4 flex items-center gap-3">
        <MiniDonut correct={correct} total={total} />
        <span className="min-w-0">
          <span className="block truncate font-bold">{label}</span>
          <span className="block text-sm text-slate-500">
            {correct}/{total}
          </span>
        </span>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-700">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm text-slate-500">{label}</span>
        <span className="block font-bold">{value}</span>
      </span>
    </div>
  )
}

export function ResultView({ attemptId }: { attemptId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<ResultDTO | null>(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [bmBusy, setBmBusy] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const r = await fetch(`/api/result/${attemptId}`)
        const b = await r.json().catch(() => null)
        if (!active) return
        if (r.status === 403) return setPhase('forbidden')
        if (r.status === 404) return setPhase('notfound')
        if (!r.ok || !b?.success) return setPhase('error')
        setData(b.data as ResultDTO)
        setPhase('ready')
        // Trạng thái bookmark đề: đọc trực tiếp bookmarks (RLS own) để reload-persist.
        const testId = (b.data as ResultDTO).test.id
        const supabase = createClient()
        const { data: bm } = await supabase.from('bookmarks').select('id').eq('test_id', testId).limit(1)
        if (active) setBookmarked((bm?.length ?? 0) > 0)
      } catch {
        if (active) setPhase('error')
      }
    })()
    return () => {
      active = false
    }
  }, [attemptId])

  const toggleBookmark = useCallback(async () => {
    if (!data || bmBusy) return
    const next = !bookmarked
    setBookmarked(next) // optimistic
    setBmBusy(true)
    try {
      const r = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test_id: data.test.id, bookmarked: next }),
      })
      if (!r.ok) setBookmarked(!next) // rollback
    } catch {
      setBookmarked(!next) // rollback
    } finally {
      setBmBusy(false)
    }
  }, [data, bookmarked, bmBusy])

  if (phase === 'loading') return <Shell><p className="text-slate-500">Đang tải kết quả…</p></Shell>
  if (phase === 'forbidden')
    return (
      <Shell>
        <h1 className="text-xl font-bold">Bài thi chưa có kết quả</h1>
        <p className="mt-2 text-slate-500">Bài này chưa được nộp nên chưa thể xem kết quả.</p>
      </Shell>
    )
  if (phase === 'notfound')
    return (
      <Shell>
        <h1 className="text-xl font-bold">Không tìm thấy kết quả</h1>
        <Link href="/products" className="dcx-btn-text-light mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium">Xem bộ đề</Link>
      </Shell>
    )
  if (phase === 'error' || !data)
    return (
      <Shell>
        <h1 className="text-xl font-bold">Có lỗi khi tải kết quả</h1>
        <button onClick={() => location.reload()} className="dcx-btn-text-light mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium">Thử lại</button>
      </Shell>
    )

  const total = data.review.length
  const correct = data.review.filter((r) => r.is_correct).length
  const skipped = data.review.filter((r) => isSkipped(r.user_answer)).length
  const wrong = total - correct - skipped
  const accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
  const minutes = Math.max(1, Math.round((data.time_spent ?? 0) / 60))

  return (
    <div className="dc-exam ct-bw ts-regular">
    <div className="mx-auto max-w-[1240px] px-4 py-8">
      {/* Tiêu đề + back (capture: ← tròn + breadcrumb đậm) */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/products"
          aria-label="Trở lại"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 text-lg text-slate-700 hover:bg-slate-50"
        >
          ‹
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold uppercase">{data.test.title || 'Kết quả bài thi'}</h1>
        <button
          onClick={toggleBookmark}
          aria-pressed={bookmarked}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${bookmarked ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-600'}`}
        >
          {bookmarked ? '★ Đã lưu đề' : '☆ Lưu đề'}
        </button>
      </div>
      <p className="mt-1 pl-13 text-sm text-slate-500">
        <span className="rounded bg-slate-100 px-1.5 py-0.5">{SKILL_LABEL[data.test.skill]}</span>{' '}
        · {data.status === 'expired' ? 'Hết giờ (tự nộp)' : 'Đã nộp'} · Thời gian: {clock(data.time_spent)}
      </p>

      {/* Phần kiểm tra (capture: 3 cột số liệu + donut band + Thử lại) */}
      <section className="mt-5 rounded-3xl border border-[#efebf4] bg-white p-7 shadow-[0_20px_44px_-30px_rgba(42,39,64,0.4)]">
        <h2 className="text-lg font-extrabold">Phần kiểm tra</h2>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="grid min-w-0 flex-1 gap-6 sm:grid-cols-3">
            <div>
              <div className="text-sm text-slate-500">Phần thi</div>
              <div className="mt-1 font-bold">{data.test.title}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Trắc nghiệm</div>
              <div className="mt-1 font-bold">
                {data.raw_score ?? 0}/{data.max_score ?? total}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Tổng điểm</div>
              <div className="mt-1 font-bold">{data.band != null ? data.band.toFixed(1) : '—'}</div>
            </div>
          </div>
          <BandDonut band={data.band} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {/* Review-in-exam (2026-07-12): mở lại giao diện thi — đáp án đúng điền sẵn + evidence highlight */}
          {/* Màu chữ đi qua .dcx-btn-text-* chứ KHÔNG dùng text-white: xem ghi chú "BẪY" trong
              app/exam.css — `.dc-exam a { color: inherit }` (không layer) đè mọi utility Tailwind. */}
          <Link
            href={`/result/${attemptId}/review`}
            className="dcx-btn-text-light inline-flex items-center gap-2 rounded-lg bg-[#0E7A43] px-4 py-2 text-sm font-semibold shadow-[0_12px_24px_-14px_rgba(14,122,67,0.9)] hover:bg-[#0b6437]"
          >
            Xem lại trong bài (đáp án + evidence) <span aria-hidden>→</span>
          </Link>
          <Link
            href={testEntryPath(data.test.skill, data.test.id)}
            className="dcx-btn-text-dark inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Thử lại bài kiểm tra <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* Chi tiết bài thi (capture: 3 vòng tròn + 4 chỉ số) */}
      <h2 className="mt-7 mb-3 text-lg font-extrabold">Chi tiết bài thi</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex items-center justify-around rounded-2xl border border-[#efebf4] bg-white p-6 shadow-[0_14px_30px_-24px_rgba(42,39,64,0.4)]">
          <StatCircle kind="correct" label="Trả lời đúng" value={correct} />
          <StatCircle kind="wrong" label="Trả lời sai" value={wrong} />
          <StatCircle kind="skipped" label="Đã bỏ qua" value={skipped} />
        </div>
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#efebf4] bg-white p-6 shadow-[0_14px_30px_-24px_rgba(42,39,64,0.4)] sm:grid-cols-2">
          <InfoRow
            icon={<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>}
            label="Kết quả làm bài"
            value={`${correct}/${total} Câu`}
          />
          <InfoRow
            icon={<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>}
            label="Thời gian làm bài"
            value={`${minutes} phút`}
          />
          <InfoRow
            icon={<span className="text-sm font-bold">%</span>}
            label="Độ chính xác"
            value={`${accuracy}%`}
          />
          <InfoRow
            icon={<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
            label="Câu đúng"
            value={`${correct} / ${total} Câu`}
          />
        </div>
      </div>

      {/* Phân loại / Độ khó / Danh mục / Phần (capture Result01) — chỉ dữ liệu có thật; thiếu metadata → "Chưa phân loại" */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CategoryCard title="Phân loại" label={SKILL_LABEL[data.test.skill]} correct={correct} total={total} />
        <CategoryCard title="Độ khó" label="Chưa phân loại" correct={correct} total={total} />
        <CategoryCard title="Danh mục" label="Chưa phân loại" correct={correct} total={total} />
        <CategoryCard title="Phần" label="Chưa phân loại" correct={correct} total={total} />
      </div>

      {/* Danh sách câu hỏi (capture tiep_tuc.png) */}
      <h2 className="mt-7 mb-3 text-lg font-extrabold">Danh sách câu hỏi</h2>
      <ReviewList review={data.review} />

      {/* Thanh đáy (capture Result01): "Tiếp tục" cam bên phải */}
      <div className="mt-8 flex items-center justify-end border-t border-slate-200 pt-4">
        {/* Nền hổ phách sáng → giữ chữ ink (6.6:1); chữ trắng ở đây chỉ 2.6:1, không đạt AA. */}
        <Link href="/products" className="dcx-btn-text-dark rounded-lg bg-[#E8A33D] px-6 py-2.5 text-sm font-bold hover:bg-[#d6932f]">
          Tiếp tục
        </Link>
      </div>
    </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dc-exam ct-bw ts-regular">
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">{children}</div>
      </div>
    </div>
  )
}
