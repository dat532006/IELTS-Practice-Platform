'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { WritingGradeResult } from '@/types/exam'
import { Mascot } from '@/components/brand/Mascot'
import { WritingResultView } from '@/components/writing/WritingResultView'

type Phase = 'loading' | 'notfound' | 'error' | 'ready'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#F8F6FC] px-4 text-center text-[#514B63]">
      <div className="rounded-[20px] border border-[#E9E3F1] bg-white px-8 py-7 shadow-[0_20px_48px_-36px_rgba(42,39,64,0.7)]">
        {children}
      </div>
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
    <div className="min-h-screen bg-[#F8F6FC] text-[#2A2740]">
      <header className="border-b border-[#ECE7F3] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          {/* Brand 2026-07-18: logo mèo (Mascot) thay hình thoi cũ — đồng bộ Header/auth. */}
          <span className="flex flex-none" style={{ filter: 'drop-shadow(0 6px 11px rgba(90,60,160,.28))' }}>
            <Mascot size={40} />
          </span>
          <div>
            <div className="text-sm font-black tracking-[-0.01em]">IELTSPractice</div>
            <div className="text-[11px] font-semibold text-[#9D96AE]">Kết quả Writing</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 py-6 sm:py-8">
        {result && <WritingResultView result={result} />}
        <Link
          href="/"
          className="mt-5 inline-flex items-center rounded-[12px] border border-[#DED7E8] bg-white px-4 py-2.5 text-sm font-extrabold text-[#5F46BD] transition hover:border-[#CFC2EA] hover:bg-[#F7F3FF]"
        >
          ← Trang chủ
        </Link>
      </main>
    </div>
  )
}
