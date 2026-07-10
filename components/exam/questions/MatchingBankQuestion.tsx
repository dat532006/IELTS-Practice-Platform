// M06 — Matching "bank hiện rõ + ô điền chữ" cho option DÀI (statement), reference: bank A–H hiện thành
//   thẻ text + mỗi mục (người/đối tượng) một ô điền chữ cái. Gom câu type 'matching_features' liên tiếp
//   cùng bank → hiện danh sách A–H MỘT LẦN + các mục ở dưới. answer = KEY (chữ cái), single value.
// KHÔNG biết đáp án / KHÔNG chấm (LUẬT THÉP #2).
import { FlagIcon } from '@/components/exam/ExamIcons'
import type { AnswerValue, ExamQuestion, QOption } from './types'

export function MatchingBankQuestion({
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
  bookmarkedQs: string[]
  onToggleBookmark: (qid: string) => void
  activeQid: string | null
  onActivate: (qid: string) => void
}) {
  return (
    <div className="dcx-mbank">
      <ul className="dcx-mbank-list">
        {options.map((o) => (
          <li key={o.key}>
            <b>{o.key}</b>
            <span>{o.text || o.key}</span>
          </li>
        ))}
      </ul>
      <div className="dcx-mbank-items">
        {questions.map((q, i) => {
          const v = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''
          const flagged = bookmarkedQs.includes(q.id)
          const isActive = activeQid === q.id
          return (
            <div
              key={q.id}
              id={`q-${q.id}`}
              className="dcx-mbank-row"
              style={{ scrollMarginTop: 96 }}
              onFocus={() => onActivate(q.id)}
            >
              <span className={`dcx-qnum${isActive ? ' active' : ''}`}>{q.number ?? i + 1}</span>
              <span className="dcx-mbank-text">{q.statement ?? q.prompt}</span>
              <input
                type="text"
                autoComplete="off"
                value={v}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                placeholder={String(q.number ?? '')}
                aria-label={`Câu ${q.number ?? i + 1} — điền chữ cái`}
                className="dcx-gap-input dcx-mbank-box"
              />
              <button
                type="button"
                onClick={() => onToggleBookmark(q.id)}
                aria-pressed={flagged}
                aria-label={flagged ? 'Bỏ đánh dấu câu' : 'Đánh dấu câu'}
                title="Đánh dấu câu để xem lại"
                className={`dcx-flag${flagged ? ' on' : ''}`}
              >
                <FlagIcon filled={flagged} className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
