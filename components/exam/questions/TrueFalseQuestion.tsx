// True/False/Not Given & Yes/No/Not Given (M06). Radio 3 lựa chọn cố định.
// answer = string ('TRUE'|'FALSE'|'NOT GIVEN' | 'YES'|'NO'|'NOT GIVEN'). KHÔNG biết đáp án.
// dc-exam restyle: option pill (.dcx-opt) với radio dot tím; nhãn UPPERCASE. Contrast lo qua .themed CSS.
import type { QuestionComponentProps } from './types'

const OPTIONS = {
  tfng: ['TRUE', 'FALSE', 'NOT GIVEN'],
  ynng: ['YES', 'NO', 'NOT GIVEN'],
} as const

export function TrueFalseQuestion({
  question,
  value,
  onChange,
  disabled,
  hideStatement,
  variant,
}: QuestionComponentProps & { variant: 'tfng' | 'ynng' }) {
  const v = typeof value === 'string' ? value : ''
  const opts = OPTIONS[variant]
  const groupName = `q-${question.id}`
  const statement = question.statement ?? question.prompt

  return (
    <div>
      {!hideStatement && statement && <p className="dcx-qstatement" style={{ marginBottom: 10 }}>{statement}</p>}
      <fieldset style={{ display: 'flex', gap: 9, flexWrap: 'wrap', border: 0, margin: 0, padding: 0 }} disabled={disabled}>
        <legend className="sr-only">{question.instruction || `Câu ${question.number ?? ''}`}</legend>
        {opts.map((opt) => {
          const isSel = v === opt
          return (
            <label key={opt} className={`dcx-opt${isSel ? ' sel' : ''}`} style={{ width: 'auto' }}>
              <input
                type="radio"
                name={groupName}
                value={opt}
                checked={isSel}
                onChange={() => !disabled && onChange(opt)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="dcx-opt-dot" />
              <span>{opt}</span>
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}
