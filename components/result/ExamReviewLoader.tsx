'use client'

// 2026-07-12 — Xem lại bài ĐÃ NỘP trong giao diện thi thật (review-in-exam).
// EXAM-003/009 (2026-07-15): CHỈ 1 nguồn = /api/result/[attemptId] (owner + terminal). Payload nội dung
//   (passages/questions/audio) nay lấy từ dto.content = BẢN CHỤP lúc START → KHÔNG còn phụ thuộc
//   /api/exam published-only (đề đã ẩn vẫn xem lại được) và nội dung cố định (đề bị sửa không làm trôi).
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
        if (rr.status === 403) return setPhase('forbidden') // RESULT_NOT_READY: bài chưa nộp
        if (rr.status === 404) return setPhase('notfound')
        if (!rr.ok || !rb?.success) return setPhase('error')
        const result = rb.data as ResultDTO

        // EXAM-003/009: payload từ bản chụp (dto.content) — KHÔNG gọi /api/exam. is_free không còn liên quan
        //   (owner+terminal đã là guard đúng cho việc xem lại bài của chính mình).
        setDto(result)
        setPayload({
          test: { id: result.test.id, title: result.test.title, skill: result.test.skill, is_free: true },
          passages: result.content.passages,
          questions: result.content.questions,
          audio_url: result.content.audio_url,
        })
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
          contentStale: dto.content_stale,
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
