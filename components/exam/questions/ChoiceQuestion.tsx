// MCQ single (radio) / MCQ multi (checkbox) (M06).
// answer = string (single) | string[] (multi) gồm option KEY. KHÔNG biết đáp án.
// W9 parity (capture): option KHÔNG viền ô — radio/checkbox trần; dòng được chọn nền xanh nhạt #E8F0FE.
import type { QuestionComponentProps } from './types'

export function ChoiceQuestion({
  question,
  value,
  onChange,
  disabled,
  contrast,
  hideStatement,
  multi,
}: QuestionComponentProps & { multi: boolean }) {
  const options = Array.isArray(question.options) ? question.options : []
  const selected: string[] = multi
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === 'string' && value !== ''
      ? [value]
      : []

  // P2c: giới hạn số lựa chọn (Choose TWO/THREE). Đủ max → KHÔNG thêm nữa + làm mờ phần dư.
  const max = multi && typeof question.select_count === 'number' ? question.select_count : undefined
  const atMax = max !== undefined && selected.length >= max

  const toggle = (key: string) => {
    if (disabled) return
    if (multi) {
      const set = new Set(selected)
      if (set.has(key)) set.delete(key)
      else {
        if (atMax) return // đã đủ max → bỏ qua
        set.add(key)
      }
      onChange(Array.from(set))
    } else {
      onChange(key)
    }
  }

  const groupName = `q-${question.id}`
  const optBase = contrast ? 'hover:bg-white/10' : 'hover:bg-slate-50'
  const optSel = contrast ? 'bg-slate-800' : 'bg-[#E8F0FE]'

  if (options.length === 0) {
    return <p className="text-sm text-amber-600">Câu hỏi thiếu lựa chọn.</p>
  }

  return (
    <fieldset className="space-y-0.5" disabled={disabled}>
      <legend className="sr-only">{question.instruction || `Câu ${question.number ?? ''}`}</legend>
      {!hideStatement && question.prompt && <p className="mb-1 font-semibold leading-snug">{question.prompt}</p>}
      {multi && question.select_count ? (
        <p className="text-xs text-slate-500">Chọn {question.select_count} đáp án.</p>
      ) : null}
      {options.map((opt) => {
        const isSel = selected.includes(opt.key)
        const muted = atMax && !isSel // đủ max + chưa chọn → mờ/khóa (reference làm xám)
        return (
          <label
            key={opt.key}
            className={`flex items-start gap-2.5 rounded px-2 py-1.5 ${isSel ? optSel : optBase} ${
              muted ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={groupName}
              value={opt.key}
              checked={isSel}
              onChange={() => toggle(opt.key)}
              disabled={disabled || muted}
              className="mt-1 shrink-0 accent-[#1A73E8]"
            />
            {/* Capture parity: reference KHÔNG hiển thị prefix chữ cái — chỉ text (key vẫn là giá trị serialize). */}
            <span className="min-w-0">{opt.text ?? opt.key}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
