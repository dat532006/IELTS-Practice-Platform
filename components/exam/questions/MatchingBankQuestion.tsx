// M06 — Matching "bank hiện rõ + ô điền chữ" cho option DÀI (statement), reference: bank A–H hiện thành
//   thẻ text + mỗi mục (người/đối tượng) một ô. Gom câu type 'matching_features' liên tiếp cùng bank →
//   hiện danh sách A–H MỘT LẦN + các mục ở dưới. answer = KEY (chữ cái), single value.
// UX như đề thi máy tính: KÉO-THẢ thẻ vào ô, HOẶC bấm thẻ rồi bấm ô (cảm ứng), HOẶC gõ chữ trực tiếp.
// KHÔNG biết đáp án / KHÔNG chấm (LUẬT THÉP #2).
import { useState } from 'react'
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
  const [picked, setPicked] = useState<string | null>(null) // thẻ đang chọn để bấm-đặt
  const [overQid, setOverQid] = useState<string | null>(null) // ô đang được kéo qua (viền sáng)

  const place = (qid: string, key: string) => {
    onAnswer(qid, key.toUpperCase().slice(0, 2))
    setPicked(null)
  }

  return (
    <div className="dcx-mbank">
      {picked && <p className="dcx-drag-hint">Đang chọn <b>{picked}</b> — bấm vào ô để đặt (hoặc bấm lại thẻ để bỏ).</p>}
      <ul className="dcx-mbank-list">
        {options.map((o) => (
          <li
            key={o.key}
            className={`dcx-chip${picked === o.key ? ' picked' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', o.key)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            role="button"
            tabIndex={0}
            aria-pressed={picked === o.key}
            onClick={() => setPicked((p) => (p === o.key ? null : o.key))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setPicked((p) => (p === o.key ? null : o.key))
              }
            }}
          >
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
                onChange={(e) => onAnswer(q.id, e.target.value.toUpperCase().slice(0, 2))}
                onClick={() => { if (picked) place(q.id, picked) }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOverQid(q.id) }}
                onDragLeave={() => setOverQid((o) => (o === q.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOverQid(null)
                  const key = e.dataTransfer.getData('text/plain')
                  if (key) place(q.id, key)
                }}
                placeholder={String(q.number ?? '')}
                aria-label={`Câu ${q.number ?? i + 1} — kéo thẻ vào hoặc gõ chữ cái`}
                className={`dcx-gap-input dcx-mbank-box${overQid === q.id ? ' drop-over' : ''}${picked ? ' droppable' : ''}`}
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
