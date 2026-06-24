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
      ? 'border-slate-500 bg-black text-white placeholder:text-slate-400 focus:border-amber-400'
      : 'border-slate-400 bg-white text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
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
            placeholder={question.number != null ? String(question.number) : '…'}
            aria-label={question.instruction || `Nhãn câu ${question.number ?? ''}`}
            style={overlayStyle(question.x, question.y)}
            className={`absolute w-20 max-w-[40%] text-center text-sm shadow sm:w-24 ${inputCls}`}
          />
        </div>
      </div>
    )
  }

  // --- Mode 2 (capture parity): dotted list "N ........ [input]" — số + dòng chấm + ô nhập ---
  return (
    <div className="space-y-2">
      {question.prompt && <p className="whitespace-pre-line leading-relaxed">{question.prompt}</p>}
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-bold">{question.number ?? ''}</span>
        <span aria-hidden className={`min-w-6 flex-1 border-b-2 border-dotted ${contrast ? 'border-slate-500' : 'border-slate-400'}`} />
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.number != null ? String(question.number) : ''}
          aria-label={question.instruction || `Nhãn câu ${question.number ?? ''}`}
          className={`w-44 text-center font-semibold placeholder:font-semibold ${inputCls}`}
        />
      </div>
    </div>
  )
}
