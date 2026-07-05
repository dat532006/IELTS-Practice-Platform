// W9 parity (T3.1/capture) — Matching Information dạng MA TRẬN (rows = câu, cols = option A–H).
// Gom nhiều câu matching_information liên tiếp (cùng pool options) → 1 bảng radio như reference.
// answer = string (option KEY) theo question.id. KHÔNG biết đáp án / KHÔNG chấm (LUẬT THÉP #2).
// dc-exam restyle: header tím chữ trắng (.dcx-mtable); ô đã chọn nền tím nhạt. Contrast lo qua .themed CSS.
import { FlagIcon } from '@/components/exam/ExamIcons'
import type { AnswerValue, ExamQuestion, QOption } from './types'

export function MatchingMatrixQuestion({
  questions,
  options,
  answers,
  onAnswer,
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
  return (
    <div className="dcx-mtable">
      <table>
        <thead>
          <tr>
            <th className="lead" />
            {options.map((o) => (
              <th key={o.key} title={o.text ?? o.key}>
                {o.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => {
            const v = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''
            const flagged = bookmarkedQs.includes(q.id)
            return (
              <tr key={q.id} id={`q-${q.id}`} className="scroll-mt-40" onFocus={() => onActivate(q.id)}>
                <td className="lead">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <b className="dcx-mnum">{q.number ?? i + 1}</b>
                    <span style={{ minWidth: 0 }}>{q.statement ?? q.prompt}</span>
                    <button
                      type="button"
                      onClick={() => onToggleBookmark(q.id)}
                      aria-pressed={flagged}
                      aria-label={flagged ? 'Bỏ đánh dấu câu' : 'Đánh dấu câu'}
                      title="Đánh dấu câu để xem lại"
                      className={`dcx-flag${flagged ? ' on' : ''}`}
                      style={{ marginLeft: 'auto' }}
                    >
                      <FlagIcon filled={flagged} className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                {options.map((o) => {
                  const sel = v === o.key
                  return (
                    <td key={o.key} className={`cell${sel ? ' sel' : ''}`} onClick={() => onAnswer(q.id, o.key)}>
                      <label style={{ display: 'inline-flex', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={o.key}
                          checked={sel}
                          onChange={() => onAnswer(q.id, o.key)}
                          aria-label={`Câu ${q.number ?? i + 1}, đáp án ${o.key}`}
                          className="sr-only"
                        />
                        <span className="dcx-opt-dot" />
                      </label>
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
