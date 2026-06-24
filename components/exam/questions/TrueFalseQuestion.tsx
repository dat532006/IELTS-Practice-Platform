// True/False/Not Given & Yes/No/Not Given (M06). Radio 3 lựa chọn cố định.
// answer = string ('TRUE'|'FALSE'|'NOT GIVEN' | 'YES'|'NO'|'NOT GIVEN'). KHÔNG biết đáp án.
// W9 parity (capture): danh sách radio DỌC, trần (không viền ô), nhãn UPPERCASE như reference.
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
  contrast,
  hideStatement,
  variant,
}: QuestionComponentProps & { variant: 'tfng' | 'ynng' }) {
  const v = typeof value === 'string' ? value : ''
  const opts = OPTIONS[variant]
  const groupName = `q-${question.id}`
  const statement = question.statement ?? question.prompt
  const base = contrast ? 'hover:bg-white/10' : 'hover:bg-slate-50'
  const sel = contrast ? 'bg-slate-800' : 'bg-[#E8F0FE]'

  return (
    <div className="space-y-1.5">
      {!hideStatement && statement && <p className="font-semibold leading-snug">{statement}</p>}
      <fieldset className="space-y-0.5" disabled={disabled}>
        <legend className="sr-only">{question.instruction || `Câu ${question.number ?? ''}`}</legend>
        {opts.map((opt) => {
          const isSel = v === opt
          return (
            <label
              key={opt}
              className={`flex w-fit cursor-pointer items-center gap-2.5 rounded px-2 py-1 pr-6 ${isSel ? sel : base}`}
            >
              <input
                type="radio"
                name={groupName}
                value={opt}
                checked={isSel}
                onChange={() => !disabled && onChange(opt)}
                disabled={disabled}
                className="shrink-0 accent-[#1A73E8]"
              />
              <span>{opt}</span>
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}
