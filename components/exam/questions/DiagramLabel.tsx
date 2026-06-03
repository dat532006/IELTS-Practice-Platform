// W7 — Diagram / Flowchart Label (M06 Listening).
// answer = string theo question.id (single value, khớp BE scoring diagram_label). KHÔNG biết đáp án.
// Có `image` + `x/y` (%) → input overlay neo theo phần trăm trên ảnh aspect-ratio cố định.
// Thiếu image → degrade về text input (vẫn trả lời + serialize đúng question.id).
import type { QuestionComponentProps } from './types'
import { overlayStyle } from './overlay'

export function DiagramLabel({ question, value, onChange, disabled, contrast }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const inputId = `q-input-${question.id}`
  const inputCls = `min-w-0 rounded-md border px-3 py-1.5 outline-none ${
    contrast
      ? 'border-slate-600 bg-black text-white focus:border-teal-400'
      : 'border-slate-300 bg-white text-slate-900 focus:border-teal-600'
  }`

  // --- Mode 1: overlay trên ảnh (neo % toạ độ, transform biên-aware chống cắt) ---
  if (question.image) {
    return (
      <div className="space-y-2">
        {question.prompt && <p className="whitespace-pre-line leading-relaxed">{question.prompt}</p>}
        <div className="relative w-full overflow-hidden rounded-md border border-slate-200" style={{ aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={question.image} alt={question.instruction || `Sơ đồ câu ${question.number ?? ''}`} className="h-full w-full object-contain" />
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
            className={`absolute w-20 max-w-[40%] text-center text-sm shadow sm:w-24 ${inputCls}`}
          />
        </div>
      </div>
    )
  }

  // --- Mode 2: degrade về text input (không có ảnh) ---
  return (
    <div className="space-y-2">
      {question.prompt && <p className="whitespace-pre-line leading-relaxed">{question.prompt}</p>}
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nhập nhãn…"
        aria-label={question.instruction || `Nhãn câu ${question.number ?? ''}`}
        className={`w-full ${inputCls}`}
      />
    </div>
  )
}
