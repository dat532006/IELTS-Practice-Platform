// Matching Headings / Information / Features / Endings (M06). W6: dropdown ổn định (drag-drop để sau).
// answer = string (option KEY). KHÔNG biết đáp án.
import type { QuestionComponentProps } from './types'

export function MatchingQuestion({ question, value, onChange, disabled, contrast, hideStatement }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const options = Array.isArray(question.options) ? question.options : []
  const selectId = `q-input-${question.id}`
  const statement = question.statement ?? question.prompt

  if (options.length === 0) {
    return <p className="text-sm text-amber-600">Câu hỏi thiếu danh sách lựa chọn.</p>
  }

  return (
    <div className="space-y-2">
      {!hideStatement && statement && <p className="font-semibold leading-snug">{statement}</p>}
      <select
        id={selectId}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={question.instruction || `Câu ${question.number ?? ''}`}
        className={`w-full min-w-0 rounded-md border px-3 py-1.5 outline-none ${
          contrast
            ? 'border-slate-600 bg-black text-white focus:border-teal-400'
            : 'border-slate-300 bg-white text-slate-900 focus:border-teal-600'
        }`}
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
