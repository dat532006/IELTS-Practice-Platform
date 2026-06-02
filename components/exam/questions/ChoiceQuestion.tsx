// MCQ single (radio) / MCQ multi (checkbox) (M06).
// answer = string (single) | string[] (multi) gồm option KEY. KHÔNG biết đáp án.
import type { QuestionComponentProps } from './types'

export function ChoiceQuestion({
  question,
  value,
  onChange,
  disabled,
  contrast,
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

  const toggle = (key: string) => {
    if (disabled) return
    if (multi) {
      const set = new Set(selected)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      onChange(Array.from(set))
    } else {
      onChange(key)
    }
  }

  const groupName = `q-${question.id}`
  const optBase = contrast ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'
  const optSel = contrast ? 'border-teal-400 bg-slate-800' : 'border-teal-500 bg-teal-50'

  if (options.length === 0) {
    return <p className="text-sm text-amber-600">Câu hỏi thiếu lựa chọn.</p>
  }

  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="sr-only">{question.instruction || `Câu ${question.number ?? ''}`}</legend>
      {multi && question.select_count ? (
        <p className="text-xs text-slate-500">Chọn {question.select_count} đáp án.</p>
      ) : null}
      {options.map((opt) => {
        const isSel = selected.includes(opt.key)
        return (
          <label
            key={opt.key}
            className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${isSel ? optSel : optBase}`}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={groupName}
              value={opt.key}
              checked={isSel}
              onChange={() => toggle(opt.key)}
              disabled={disabled}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="font-medium">{opt.key}.</span> {opt.text}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
