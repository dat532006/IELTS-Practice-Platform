'use client'

// 2026-07-12 — Xem lại bài ĐÃ NỘP trong giao diện thi thật (review-in-exam).
// Fetch 2 nguồn ĐÃ CÓ GUARD server: /api/result/[attemptId] (owner + terminal → review items,
// gồm evidence/explanation) + /api/exam/[testId] (payload sau access check is_free|unlock).
// KHÔNG API mới, KHÔNG chấm lại — chỉ ghép dữ liệu cho ExamRunner chế độ review (read-only).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExamRunner } from '@/components/exam/ExamRunner'
import type { ExamPayload, ResultDTO } from '@/types/exam'
import type { HighlightAnchor } from '@/lib/exam/highlight-anchor'

type Phase = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error'

export function ExamReviewLoader({ attemptId }: { attemptId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [dto, setDto] = useState<ResultDTO | null>(null)
  const [payload, setPayload] = useState<ExamPayload | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rr = await fetch(`/api/result/${attemptId}`)
        const rb = await rr.json().catch(() => null)
        if (!alive) return
        if (rr.status === 403) return setPhase('forbidden')
        if (rr.status === 404) return setPhase('notfound')
        if (!rr.ok || !rb?.success) return setPhase('error')
        const result = rb.data as ResultDTO

        const pr = await fetch(`/api/exam/${result.test.id}`)
        const pb = await pr.json().catch(() => null)
        if (!alive) return
        // Payload cần quyền truy cập đề (free|unlock) — mất quyền (hiếm) → coi như forbidden.
        if (pr.status === 403) return setPhase('forbidden')
        if (!pr.ok || !pb?.success) return setPhase('error')

        setDto(result)
        setPayload(pb.data as ExamPayload)
        setPhase('ready')
      } catch {
        if (alive) setPhase('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [attemptId])

  if (phase === 'ready' && dto && payload) {
    return (
      <ExamRunner
        testId={dto.test.id}
        review={{
          payload,
          items: dto.review,
          attemptId,
          highlights: Array.isArray(dto.highlights) ? (dto.highlights as HighlightAnchor[]) : [],
        }}
      />
    )
  }

  return (
    <div className="dc-exam ct-bw ts-regular">
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          {phase === 'loading' && <p className="rmuted">Đang tải bài xem lại…</p>}
          {phase === 'forbidden' && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800 }}>Không xem lại được bài này</h1>
              <p className="rmuted" style={{ marginTop: 8 }}>
                Bài chưa nộp hoặc bạn không còn quyền truy cập đề.
              </p>
            </>
          )}
          {phase === 'notfound' && <h1 style={{ fontSize: 22, fontWeight: 800 }}>Không tìm thấy bài làm</h1>}
          {phase === 'error' && <h1 style={{ fontSize: 22, fontWeight: 800 }}>Có lỗi khi tải bài xem lại</h1>}
          {phase !== 'loading' && (
            <Link href={`/result/${attemptId}`} className="dcx-btn-primary" style={{ marginTop: 18, display: 'inline-block' }}>
              ← Về trang kết quả
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
