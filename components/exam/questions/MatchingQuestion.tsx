// Matching Headings / Information / Features / Endings (M06). W6: dropdown ổn định (drag-drop để sau).
// answer = string (option KEY). KHÔNG biết đáp án.
// dc-exam restyle: select bo tròn (.dcx-select); contrast lo qua .themed CSS.
import type { QuestionComponentProps } from './types'

export function MatchingQuestion({ question, value, onChange, disabled, hideStatement }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const options = Array.isArray(question.options) ? question.options : []
  const selectId = `q-input-${question.id}`
  const statement = question.statement ?? question.prompt

  if (options.length === 0) {
    return <p className="text-sm text-amber-600">Câu hỏi thiếu danh sách lựa chọn.</p>
  }

  return (
    <div>
      {!hideStatement && statement && <p className="dcx-qstatement" style={{ marginBottom: 8 }}>{statement}</p>}
      <select
        id={selectId}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={question.instruction || `Câu ${question.number ?? ''}`}
        className="dcx-select"
      >
        <option value="">— Chọn —</option>
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
