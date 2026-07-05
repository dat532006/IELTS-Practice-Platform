// Gap Filling / Summary / Sentence / Short Answer / Form / Notes / Table completion (M06).
// W9: render INLINE — chèn <input> ĐÚNG vị trí chỗ trống trong câu (marker `____`/`___`/`{{n}}`),
//   ô rỗng hiển thị SỐ CÂU (giống reference). Không có marker → fallback input full-width (không vỡ).
// Controlled; answer = string theo question.id. KHÔNG biết đáp án.
// dc-exam restyle: input gạch chân tím (.dcx-gap-input); contrast lo qua .themed CSS.
import type { QuestionComponentProps } from './types'

// Tách prompt theo marker chỗ trống: 3+ underscore HOẶC {{...}} (1 ô/câu ở W9).
const BLANK_RE = /_{3,}|\{\{[^}]*\}\}/

export function GapFillQuestion({ question, value, onChange, disabled }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const inputId = `q-input-${question.id}`
  const prompt = question.prompt ?? ''
  const m = prompt.match(BLANK_RE)

  // --- Mode 1: inline tại chỗ trống ---
  if (m && m.index !== undefined) {
    const before = prompt.slice(0, m.index)
    const after = prompt.slice(m.index + m[0].length)
    return (
      <p className="rtext" style={{ lineHeight: 1.9 }}>
        {before}
        <input
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          disabled={disabled}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.number != null ? String(question.number) : '…'}
          aria-label={question.instruction || `Câu ${question.number ?? ''}`}
          className="dcx-gap-input"
          style={{ margin: '0 6px' }}
        />
        {after}
      </p>
    )
  }

  // --- Mode 2: fallback full-width (không có marker) ---
  return (
    <div>
      {prompt && <p className="rtext" style={{ whiteSpace: 'pre-line', marginBottom: 8 }}>{prompt}</p>}
      <input
        id={inputId}
        type="text"
        inputMode="text"
        autoComplete="off"
        disabled={disabled}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nhập câu trả lời…"
        aria-label={question.instruction || `Câu ${question.number ?? ''}`}
        className="dcx-gap-input block"
      />
    </div>
  )
}
