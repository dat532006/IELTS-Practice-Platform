// True/False/Not Given & Yes/No/Not Given (M06). Radio 3 lựa chọn cố định.
// answer = string ('TRUE'|'FALSE'|'NOT GIVEN' | 'YES'|'NO'|'NOT GIVEN'). KHÔNG biết đáp án.
import type { QuestionComponentProps } from './types'

const OPTIONS = {
  tfng: ['TRUE', 'FALSE', 'NOT GIVEN'],
  ynng: ['YES', 'NO', 'NOT GIVEN'],
} as const

const LABEL: Record<string, string> = {
  TRUE: 'True',
  FALSE: 'False',
  YES: 'Yes',
  NO: 'No',
  'NOT GIVEN': 'Not Given',
}

export function TrueFalseQuestion({
  question,
  value,
  onChange,
  disabled,
  contrast,
  variant,
}: QuestionComponentProps & { variant: 'tfng' | 'ynng' }) {
  const v = typeof value === 'string' ? value : ''
  const opts = OPTIONS[variant]
  const groupName = `q-${question.id}`
  const statement = question.statement ?? question.prompt
  const base = contrast ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'
  const sel = contrast ? 'border-teal-400 bg-slate-800' : 'border-teal-500 bg-teal-50'

  return (
    <div className="space-y-2">
      {statement && <p className="leading-relaxed">{statement}</p>}
      <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
        <legend className="sr-only">{question.instruction || `Câu ${question.number ?? ''}`}</legend>
        {opts.map((opt) => {
          const isSel = v === opt
          return (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 ${isSel ? sel : base}`}
            >
              <input
                type="radio"
                name={groupName}
                value={opt}
                checked={isSel}
                onChange={() => !disabled && onChange(opt)}
                disabled={disabled}
                className="shrink-0"
              />
              <span>{LABEL[opt] ?? opt}</span>
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}
