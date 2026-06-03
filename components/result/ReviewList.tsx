// W8 — Review list (M05/M06). Render từ sanitized ReviewItem (API đã guard).
// LUẬT THÉP #2/#12: KHÔNG import scoring; KHÔNG tự chấm; chỉ hiển thị is_correct từ API.
import type { ReviewItem } from '@/types/exam'

function fmtAnswer(v: ReviewItem['user_answer']): string {
  if (v == null) return ''
  return Array.isArray(v) ? v.join(', ') : v
}

export function ReviewList({ review }: { review: ReviewItem[] }) {
  if (!review || review.length === 0) {
    return <p className="text-slate-500">Không có dữ liệu review cho bài này.</p>
  }
  const correct = review.filter((r) => r.is_correct).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Đúng <b className="text-teal-700">{correct}</b>/{review.length} câu
      </p>
      <ol className="space-y-2">
        {review.map((r) => {
          const user = fmtAnswer(r.user_answer)
          return (
            <li
              key={r.question_id}
              className={`rounded-lg border p-3 ${r.is_correct ? 'border-teal-200 bg-teal-50/50' : 'border-rose-200 bg-rose-50/50'}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{r.number ?? '•'}.</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${r.is_correct ? 'bg-teal-600 text-white' : 'bg-rose-600 text-white'}`}
                >
                  {r.is_correct ? 'Đúng' : 'Sai'}
                </span>
                {r.type && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{r.type}</span>}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Bạn trả lời</dt>
                <dd className={user ? '' : 'italic text-slate-400'}>{user || '(bỏ trống)'}</dd>
                <dt className="text-slate-500">Đáp án đúng</dt>
                <dd className="font-medium text-slate-800">{r.correct_answers.join(', ')}</dd>
              </dl>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
