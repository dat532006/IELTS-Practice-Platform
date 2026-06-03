// W7 — Map / Plan Labelling (M06 Listening).
// answer = string theo question.id (single value, khớp BE scoring map_labelling). KHÔNG biết đáp án.
// Ưu tiên: có `options` → dropdown chọn letter (A-D...) ; có `image` → input overlay neo % ; else text.
import type { QuestionComponentProps } from './types'
import { overlayStyle } from './overlay'

export function MapLabel({ question, value, onChange, disabled, contrast }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const inputId = `q-input-${question.id}`
  const options = Array.isArray(question.options) ? question.options : []
  const fieldCls = `min-w-0 rounded-md border px-3 py-1.5 outline-none ${
    contrast
      ? 'border-slate-600 bg-black text-white focus:border-teal-400'
      : 'border-slate-300 bg-white text-slate-900 focus:border-teal-600'
  }`

  // --- Mode 1: chọn vị trí theo letter (options) — phổ biến với map IELTS ---
  if (options.length > 0) {
    return (
      <div className="space-y-2">
        {question.prompt && <p className="leading-relaxed">{question.prompt}</p>}
        <select
          id={inputId}
          value={v}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={question.instruction || `Câu ${question.number ?? ''}`}
          className={`w-full ${fieldCls}`}
        >
          <option value="">— Chọn vị trí —</option>
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.key}
              {opt.text ? ` — ${opt.text}` : ''}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // --- Mode 2: input overlay trên ảnh bản đồ/mặt bằng (neo %, transform biên-aware chống cắt) ---
  if (question.image) {
    return (
      <div className="space-y-2">
        {question.prompt && <p className="leading-relaxed">{question.prompt}</p>}
        <div className="relative w-full overflow-hidden rounded-md border border-slate-200" style={{ aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={question.image} alt={question.instruction || `Bản đồ câu ${question.number ?? ''}`} className="h-full w-full object-contain" />
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            disabled={disabled}
            value={v}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…"
            aria-label={question.instruction || `Nhãn câu ${question.number ?? ''}`}
            style={overlayStyle(question.x, question.y)}
            className={`absolute w-20 max-w-[40%] text-center text-sm shadow ${fieldCls}`}
          />
        </div>
      </div>
    )
  }

  // --- Mode 3: degrade text input ---
  return (
    <div className="space-y-2">
      {question.prompt && <p className="leading-relaxed">{question.prompt}</p>}
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nhập câu trả lời…"
        aria-label={question.instruction || `Câu ${question.number ?? ''}`}
        className={`w-full ${fieldCls}`}
      />
    </div>
  )
}
