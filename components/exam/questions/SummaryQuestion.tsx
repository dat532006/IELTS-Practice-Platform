// M06 — Summary completion NHIỀU chỗ trống trong 1 đoạn liền mạch (reference: "Complete the summary…").
// Gom câu type 'summary' liên tiếp → 1 khối: template (prompt chứa marker [n]) chèn ô nhập tại từng [n],
//   khớp câu theo `number`. Đoạn đầu KHÔNG có marker → tiêu đề căn giữa (như reference).
// answer theo question.id (single value, khớp BE scoring). KHÔNG biết đáp án (LUẬT THÉP #2).
import type { AnswerValue, ExamQuestion } from './types'

const MARKER = /(\[\d+\])/g // giữ delimiter khi split
const IS_MARKER = /^\[(\d+)\]$/

export function SummaryQuestion({
  questions,
  template,
  answers,
  onAnswer,
}: {
  questions: ExamQuestion[]
  template: string
  answers: Record<string, AnswerValue>
  onAnswer: (qid: string, v: AnswerValue) => void
}) {
  const byNum = new Map<number, ExamQuestion>()
  for (const q of questions) if (typeof q.number === 'number') byNum.set(q.number, q)

  const paras = (template || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  const hasMarker = (s: string) => /\[\d+\]/.test(s)

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
              onChange={(e) => onAnswer(q.id, e.target.value)}
              placeholder={String(n)}
              aria-label={`Câu ${n}`}
              className="dcx-gap-input"
              style={{ margin: '0 6px' }}
            />
          </span>
        )
      })}
    </p>
  )

  return (
    <div className="dcx-summary">
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
