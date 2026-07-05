// MCQ single (radio) / MCQ multi (checkbox) (M06).
// answer = string (single) | string[] (multi) gồm option KEY. KHÔNG biết đáp án.
// dc-exam restyle: option full-width (.dcx-opt) radio dot / checkbox box tím; contrast lo qua .themed CSS.
import type { QuestionComponentProps } from './types'

export function ChoiceQuestion({
  question,
  value,
  onChange,
  disabled,
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

  if (options.length === 0) {
    return <p className="text-sm text-amber-600">Câu hỏi thiếu lựa chọn.</p>
  }

  return (
    <fieldset style={{ display: 'flex', flexDirection: 'column', gap: 9, border: 0, margin: 0, padding: 0 }} disabled={disabled}>
      <legend className="sr-only">{question.instruction || `Câu ${question.number ?? ''}`}</legend>
      {!hideStatement && question.prompt && <p className="dcx-qstatement" style={{ marginBottom: 2 }}>{question.prompt}</p>}
      {multi && question.select_count ? <p className="dcx-opt-hint">Chọn {question.select_count} đáp án.</p> : null}
      {options.map((opt) => {
        const isSel = selected.includes(opt.key)
        const muted = atMax && !isSel // đủ max + chưa chọn → mờ/khóa
        return (
          <label
            key={opt.key}
            className={`dcx-opt${isSel ? ' sel' : ''}${muted ? ' disabled' : ''}`}
            style={{ alignItems: 'flex-start', width: '100%' }}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={groupName}
              value={opt.key}
              checked={isSel}
              onChange={() => toggle(opt.key)}
              disabled={disabled || muted}
              className="sr-only"
            />
            <span className={multi ? 'dcx-opt-box' : 'dcx-opt-dot'} style={{ marginTop: 2 }} />
            {/* Capture parity: reference KHÔNG hiển thị prefix chữ cái — chỉ text (key vẫn là giá trị serialize). */}
            <span style={{ minWidth: 0, fontWeight: 500 }}>{opt.text ?? opt.key}</span>
          </label>
        )
      })}
    </fieldset>
  )
}
