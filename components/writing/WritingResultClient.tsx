'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { WritingGradeResult } from '@/types/exam'
import { WritingResultView } from '@/components/writing/WritingResultView'

// W10 (F-B) — trang xem lại kết quả Writing đã chấm. Fetch GET /api/writing-result/[id] (owner-guard).
type Phase = 'loading' | 'notfound' | 'error' | 'ready'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center text-slate-700">
      <div>{children}</div>
    </div>
  )
}

export function WritingResultClient({ attemptId }: { attemptId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [result, setResult] = useState<WritingGradeResult | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const r = await fetch(`/api/writing-result/${attemptId}`)
        if (r.status === 401) {
          window.location.href = `/login?next=/writing-result/${attemptId}`
          return
        }
        if (r.status === 404) {
          if (active) setPhase('notfound')
          return
        }
        const j = await r.json().catch(() => null)
        if (!active) return
        if (!r.ok || !j?.data) return setPhase('error')
        setResult(j.data as WritingGradeResult)
        setPhase('ready')
      } catch {
        if (active) setPhase('error')
      }
    })()
    return () => {
      active = false
    }
  }, [attemptId])

  if (phase === 'loading') return <Centered>Đang tải kết quả…</Centered>
  if (phase === 'notfound') return <Centered>Không tìm thấy kết quả bài viết.</Centered>
  if (phase === 'error') return <Centered>Đã có lỗi xảy ra.</Centered>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-600 text-sm font-bold text-white">IP</span>
          <div className="font-semibold">Kết quả Writing</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {result && <WritingResultView result={result} />}
        <Link href="/" className="mt-4 inline-block text-sm text-teal-700 underline">
          ← Trang chủ
        </Link>
      </main>
    </div>
  )
}
