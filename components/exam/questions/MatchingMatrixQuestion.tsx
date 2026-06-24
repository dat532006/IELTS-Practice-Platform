// W9 parity (T3.1/capture) — Matching Information dạng MA TRẬN (rows = câu, cols = option A–H).
// Gom nhiều câu matching_information liên tiếp (cùng pool options) → 1 bảng radio như reference.
// answer = string (option KEY) theo question.id. KHÔNG biết đáp án / KHÔNG chấm (LUẬT THÉP #2).
// Instruction hiển thị ở block header ("Questions a–b") phía trên — component KHÔNG lặp lại.
import { BookmarkFlag } from '@/components/exam/BookmarkFlag'
import type { AnswerValue, ExamQuestion, QOption } from './types'

export function MatchingMatrixQuestion({
  questions,
  options,
  answers,
  onAnswer,
  contrast,
  bookmarkedQs,
  onToggleBookmark,
  activeQid,
  onActivate,
}: {
  questions: ExamQuestion[]
  options: QOption[]
  answers: Record<string, AnswerValue>
  onAnswer: (qid: string, v: AnswerValue) => void
  contrast?: boolean
  bookmarkedQs: string[]
  onToggleBookmark: (qid: string) => void
  activeQid: string | null
  onActivate: (qid: string) => void
}) {
  const borderCls = contrast ? 'border-slate-600' : 'border-slate-200'

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`border ${borderCls} px-2 py-1.5`} />
            {options.map((o) => (
              <th key={o.key} className={`border ${borderCls} bg-[#1A73E8] px-2 py-1.5 text-center font-bold text-white`} title={o.text ?? o.key}>
                {o.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => {
            const v = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''
            const flagged = bookmarkedQs.includes(q.id)
            const isActive = activeQid === q.id
            return (
              <tr key={q.id} id={`q-${q.id}`} className="scroll-mt-40" onFocus={() => onActivate(q.id)}>
                <td className={`border ${borderCls} px-2 py-2 align-top`}>
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-1 text-xs font-bold ${isActive ? 'border-2 border-amber-500' : ''}`}>
                      {q.number ?? i + 1}
                    </span>
                    <span className="min-w-0 font-semibold">{q.statement ?? q.prompt}</span>
                    <button
                      type="button"
                      onClick={() => onToggleBookmark(q.id)}
                      aria-pressed={flagged}
                      aria-label={flagged ? 'Bỏ đánh dấu câu' : 'Đánh dấu câu'}
                      title="Đánh dấu câu để xem lại"
                      className={`ml-auto shrink-0 ${flagged ? '' : 'text-slate-400 hover:text-slate-500'}`}
                    >
                      <BookmarkFlag filled={flagged} className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                {options.map((o) => {
                  const sel = v === o.key
                  return (
                    <td key={o.key} className={`border ${borderCls} px-2 py-2 text-center ${sel ? 'bg-[#E8F0FE]' : ''}`}>
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={o.key}
                        checked={sel}
                        onChange={() => onAnswer(q.id, o.key)}
                        aria-label={`Câu ${q.number ?? i + 1}, đáp án ${o.key}`}
                        className="accent-[#1A73E8]"
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
