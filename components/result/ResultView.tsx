'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SKILL_LABEL } from '@/lib/products/access-state'
import { ReviewList } from '@/components/result/ReviewList'
import type { ResultDTO } from '@/types/exam'

type Phase = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error'

function clock(sec: number | null): string {
  const s = Math.max(0, Math.floor(sec ?? 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
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
        <Link href="/products" className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">Xem bộ đề</Link>
      </Shell>
    )
  if (phase === 'error' || !data)
    return (
      <Shell>
        <h1 className="text-xl font-bold">Có lỗi khi tải kết quả</h1>
        <button onClick={() => location.reload()} className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">Thử lại</button>
      </Shell>
    )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.test.title || 'Kết quả bài thi'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5">{SKILL_LABEL[data.test.skill]}</span>{' '}
            · {data.status === 'expired' ? 'Hết giờ (tự nộp)' : 'Đã nộp'} · Thời gian: {clock(data.time_spent)}
          </p>
        </div>
        <button
          onClick={toggleBookmark}
          aria-pressed={bookmarked}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${bookmarked ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-600'}`}
        >
          {bookmarked ? '★ Đã lưu đề' : '☆ Lưu đề'}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <div className="text-xs text-slate-500">Điểm thô</div>
            <div className="text-2xl font-bold text-teal-700">
              {data.raw_score ?? '—'}
              {data.max_score != null ? <span className="text-base font-normal text-slate-400">/{data.max_score}</span> : null}
            </div>
          </div>
          {data.band != null && (
            <div>
              <div className="text-xs text-slate-500">Band</div>
              <div className="text-2xl font-bold text-teal-700">{data.band}</div>
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Xem lại đáp án</h2>
      <ReviewList review={data.review} />

      <div className="mt-6">
        <Link href="/products" className="text-sm text-teal-700 underline">← Về danh sách bộ đề</Link>
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  )
}
