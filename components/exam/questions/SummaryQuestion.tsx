// M06 — Summary completion NHIỀU chỗ trống trong 1 đoạn liền mạch (reference: "Complete the summary…").
// Gom câu type 'summary' liên tiếp → 1 khối: template (prompt chứa marker [n]) chèn ô nhập tại từng [n],
//   khớp câu theo `number`. Đoạn đầu KHÔNG có marker → tiêu đề căn giữa (như reference).
// Nếu có word-bank (options A–G, dạng "list of words") → hiện bank KÉO-THẢ; ô = drop target + gõ được.
// answer theo question.id (single value, khớp BE scoring). KHÔNG biết đáp án (LUẬT THÉP #2).
import { useState } from 'react'
import type { AnswerValue, ExamQuestion, QOption } from './types'

const MARKER = /(\[\d+\])/g // giữ delimiter khi split
const IS_MARKER = /^\[(\d+)\]$/

export function SummaryQuestion({
  questions,
  template,
  options,
  answers,
  onAnswer,
}: {
  questions: ExamQuestion[]
  template: string
  options?: QOption[]
  answers: Record<string, AnswerValue>
  onAnswer: (qid: string, v: AnswerValue) => void
}) {
  const byNum = new Map<number, ExamQuestion>()
  for (const q of questions) if (typeof q.number === 'number') byNum.set(q.number, q)

  const hasBank = Array.isArray(options) && options.length > 0
  const [picked, setPicked] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const paras = (template || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  const hasMarker = (s: string) => /\[\d+\]/.test(s)

  const place = (qid: string, key: string) => {
    onAnswer(qid, hasBank ? key.toUpperCase().slice(0, 2) : key)
    setPicked(null)
  }

  const renderPara = (text: string, key: number) => (
    <p key={key} className="rtext dcx-summary-p" style={{ textAlign: 'justify' }}>
      {text.split(MARKER).map((seg, i) => {
        const m = seg.match(IS_MARKER)
        if (!m) return <span key={i}>{seg}</span>
        const n = Number(m[1])
        const q = byNum.get(n)
        if (!q) return <span key={i}>{seg}</span> // marker không khớp câu → giữ literal
        const v = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''
        return (
          <span key={i} id={`q-${q.id}`} style={{ scrollMarginTop: 96 }}>
            <input
              type="text"
              autoComplete="off"
              value={v}
              onChange={(e) => onAnswer(q.id, hasBank ? e.target.value.toUpperCase().slice(0, 2) : e.target.value)}
              onClick={() => { if (picked) place(q.id, picked) }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOverId(q.id) }}
              onDragLeave={() => setOverId((o) => (o === q.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                setOverId(null)
                const key = e.dataTransfer.getData('text/plain')
                if (key) place(q.id, key)
              }}
              placeholder={String(n)}
              aria-label={`Câu ${n}`}
              className={`dcx-gap-input${hasBank ? ' dcx-mbank-box' : ''}${overId === q.id ? ' drop-over' : ''}${hasBank && picked ? ' droppable' : ''}`}
              style={{ margin: '0 6px', ...(hasBank ? { width: 56, textAlign: 'center' as const } : {}) }}
            />
          </span>
        )
      })}
    </p>
  )

  return (
    <div className="dcx-summary">
      {hasBank && (
        <>
          {picked && <p className="dcx-drag-hint">Đang chọn <b>{picked}</b> — bấm vào ô trống để đặt (hoặc bấm lại thẻ để bỏ).</p>}
          <ul className="dcx-mbank-list dcx-summary-bank">
            {options!.map((o) => (
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
        </>
      )}
      {paras.map((p, i) =>
        i === 0 && !hasMarker(p) ? (
          <div key={i} className="dcx-summary-title">
            {p}
          </div>
        ) : (
          renderPara(p, i)
        ),
      )}
    </div>
  )
}
