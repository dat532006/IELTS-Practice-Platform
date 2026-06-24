// Gap Filling / Summary / Sentence / Short Answer / Form / Notes / Table completion (M06).
// W9: render INLINE — chèn <input> ĐÚNG vị trí chỗ trống trong câu (marker `____`/`___`/`{{n}}`),
//   ô rỗng hiển thị SỐ CÂU (giống reference). Không có marker → fallback input full-width (không vỡ).
// Controlled; answer = string theo question.id. KHÔNG biết đáp án.
import type { QuestionComponentProps } from './types'

// Tách prompt theo marker chỗ trống: 3+ underscore HOẶC {{...}} (1 ô/câu ở W9).
const BLANK_RE = /_{3,}|\{\{[^}]*\}\}/

export function GapFillQuestion({ question, value, onChange, disabled, contrast }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const inputId = `q-input-${question.id}`
  const prompt = question.prompt ?? ''
  const m = prompt.match(BLANK_RE)

  // Capture parity: ô input viền đậm hơn (slate-400), chữ/đặt chỗ ĐẬM căn giữa, focus viền CAM.
  const inputCls = (extra: string) =>
    `rounded-md border px-2 py-1 font-semibold outline-none placeholder:font-semibold ${extra} ${
      contrast
        ? 'border-slate-500 bg-black text-white placeholder:text-slate-400 focus:border-amber-400'
        : 'border-slate-400 bg-white text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
    }`

  // --- Mode 1: inline tại chỗ trống ---
  if (m && m.index !== undefined) {
    const before = prompt.slice(0, m.index)
    const after = prompt.slice(m.index + m[0].length)
    return (
      <p className="leading-relaxed">
        {before}
        <input
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          disabled={disabled}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.number != null ? String(question.number) : ''}
          aria-label={question.instruction || `Câu ${question.number ?? ''}`}
          className={inputCls('mx-1 inline-block w-48 max-w-full align-baseline text-center')}
        />
        {after}
      </p>
    )
  }

  // --- Mode 2: fallback full-width (không có marker) ---
  return (
    <div className="space-y-2">
      {prompt && <p className="whitespace-pre-line leading-relaxed">{prompt}</p>}
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
        className={inputCls('w-full min-w-0')}
      />
    </div>
  )
}
