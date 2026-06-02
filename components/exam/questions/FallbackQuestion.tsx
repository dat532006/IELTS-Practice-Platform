// Fallback cho question.type chưa hỗ trợ (M06). KHÔNG crash exam — vẫn trả lời được bằng text.
import type { QuestionComponentProps } from './types'

export function FallbackQuestion({ question, value, onChange, disabled, contrast }: QuestionComponentProps) {
  const v = typeof value === 'string' ? value : ''
  return (
    <div className="space-y-1.5">
      {question.prompt && <p className="whitespace-pre-line leading-relaxed">{question.prompt}</p>}
      <input
        type="text"
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
      <p className="text-xs text-slate-400">Dạng câu hỏi này sẽ được bổ sung giao diện riêng ở bản sau.</p>
    </div>
  )
}
