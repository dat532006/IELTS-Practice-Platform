// Gap Filling / Summary Completion / Sentence Completion / Short Answer (M06).
// Controlled text input; answer = string theo question.id. KHÔNG biết đáp án.
import type { QuestionComponentProps } from './types'

export function GapFillQuestion({ question, value, onChange, disabled, contrast }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  const inputId = `q-input-${question.id}`
  return (
    <div className="space-y-2">
      {question.prompt && <p className="whitespace-pre-line leading-relaxed">{question.prompt}</p>}
      <input
        id={inputId}
        type="text"
        inputMode="text"
        autoComplete="off"
        disabled={disabled}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nhập câu trả lời…"
        aria-label={question.instruction || `Câu ${question.number ?? ''}`}
        className={`w-full min-w-0 rounded-md border px-3 py-1.5 outline-none ${
          contrast
            ? 'border-slate-600 bg-black text-white focus:border-teal-400'
            : 'border-slate-300 bg-white text-slate-900 focus:border-teal-600'
        }`}
      />
    </div>
  )
}
