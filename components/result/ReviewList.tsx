'use client'

// W8 — Review list (M05/M06) — W9 parity (capture tiep_tuc.png "Danh sách câu hỏi"):
// lưới 2 cột, mỗi dòng "Câu số N: <đáp án đúng (đỏ đậm)>" + chip trạng thái + câu trả lời của bạn.
// Chip: ✓ xanh (đúng) / ✕ đỏ (sai) / ⇥ cam (bỏ qua → hiển thị "..."). Có thu gọn (−/+).
// LUẬT THÉP #2/#12: KHÔNG import scoring; KHÔNG tự chấm; chỉ hiển thị is_correct từ API.
import { useState } from 'react'
import type { ReviewItem } from '@/types/exam'

function fmtAnswer(v: ReviewItem['user_answer']): string {
  if (v == null) return ''
  return Array.isArray(v) ? v.join(', ') : v
}

function StatusChip({ status }: { status: 'correct' | 'wrong' | 'skipped' }) {
  const bg = status === 'correct' ? 'bg-[#34A853]' : status === 'wrong' ? 'bg-[#EA4335]' : 'bg-[#F0623C]'
  return (
    <span className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-white ${bg}`} aria-hidden>
      {status === 'correct' && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
      )}
      {status === 'wrong' && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      )}
      {status === 'skipped' && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h12M12 6l6 6-6 6" /><path d="M20 5v14" /></svg>
      )}
    </span>
  )
}

export function ReviewList({ review }: { review: ReviewItem[] }) {
  const [open, setOpen] = useState(true)
  if (!review || review.length === 0) {
    return <p className="text-slate-500">Không có dữ liệu review cho bài này.</p>
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold uppercase">Tất cả câu hỏi</h3>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Thu gọn danh sách' : 'Mở danh sách'}
          className="px-2 text-xl font-bold text-slate-600"
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
          {review.map((r) => {
            const user = fmtAnswer(r.user_answer)
            const skipped = user.trim() === ''
            const status: 'correct' | 'wrong' | 'skipped' = r.is_correct ? 'correct' : skipped ? 'skipped' : 'wrong'
            return (
              <div key={r.question_id} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
                <span className="shrink-0 text-sm text-slate-700">Câu số {r.number ?? '•'}:</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#D93025]" title={r.correct_answers.join(', ')}>
                  {r.correct_answers.join(', ')}
                </span>
                <StatusChip status={status} />
                <span className={`w-20 shrink-0 truncate text-sm ${skipped ? 'text-slate-400' : 'font-semibold text-slate-800'}`} title={user || undefined}>
                  {skipped ? '...' : user}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 2026-07-26 (Owner): trang kết quả CHỈ hiện đáp án. Giải thích chuyển hẳn sang trang
          "Xem chi tiết" (/result/[attemptId]/review) — nút 💡 dưới từng câu, xem `ExplainToggle`. */}
    </section>
  )
}
