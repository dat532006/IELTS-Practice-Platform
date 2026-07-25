'use client'

// Nút 💡 "Giải thích" trong CHẾ ĐỘ XEM LẠI (`/result/[attemptId]/review`).
// Đặt dưới mỗi câu lẻ, hoặc dưới mỗi KHỐI nhiều câu (summary / matrix / matchbank) — 1 nút/khối.
// Mặc định thu gọn (explanation thường dài); bấm mới mở.
// LUẬT THÉP #2: KHÔNG tự chấm, KHÔNG biết đáp án — chỉ hiển thị `explanation`/`correct_answers`
//   đã đi qua DTO review (owner + attempt submitted|expired) ở `lib/exam/review.ts`.
import { useState } from 'react'
import type { ReviewItem } from '@/types/exam'
import type { ExamQuestion } from '@/components/exam/questions/types'

function BulbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3z" />
    </svg>
  )
}

const fmt = (v: ReviewItem['user_answer']): string => (v == null ? '' : Array.isArray(v) ? v.join(', ') : v)

export function ExplainToggle({
  qs,
  reviewByQid,
}: {
  qs: ExamQuestion[]
  reviewByQid: Map<string, ReviewItem>
}) {
  const [open, setOpen] = useState(false)
  // Chỉ lấy câu THỰC SỰ có giải thích (admin author ở answer_keys); không có → không hiện nút.
  const items = qs
    .map((q) => reviewByQid.get(q.id))
    .filter((r): r is ReviewItem => !!r && typeof r.explanation === 'string' && r.explanation.trim() !== '')
  if (items.length === 0) return null

  const label = items.length > 1 ? `Giải thích (${items.length} câu)` : 'Giải thích'
  return (
    <div className="dcx-explain">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`dcx-explain-btn${open ? ' on' : ''}`}
        title={open ? 'Ẩn giải thích' : 'Xem giải thích'}
      >
        <BulbIcon className="dcx-explain-bulb" />
        <span>{label}</span>
        <span aria-hidden className={`dcx-explain-caret${open ? ' on' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="dcx-explain-panel">
          {items.map((r) => {
            const mine = fmt(r.user_answer)
            const skipped = mine.trim() === ''
            return (
              <div key={r.question_id} className="dcx-explain-item">
                <div className="dcx-explain-head">
                  <span className="dcx-explain-num">Câu {r.number ?? '•'}</span>
                  {/* Ở chế độ xem lại, ô nhập đã điền ĐÁP ÁN ĐÚNG → nhắc lại bài làm của thí sinh ở đây. */}
                  <span className={skipped ? 'dcx-explain-skip' : r.is_correct ? 'dcx-explain-ok' : 'dcx-explain-bad'}>
                    {skipped ? 'bỏ trống' : mine}
                  </span>
                  <span aria-hidden className="dcx-explain-arrow">→</span>
                  <span className="dcx-explain-ok">{r.correct_answers.join(', ')}</span>
                </div>
                <p className="dcx-explain-text">{r.explanation}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
