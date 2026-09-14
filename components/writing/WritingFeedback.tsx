import type { ReactNode } from 'react'
import { parseWritingFeedback, type WritingFeedbackCriterion } from '@/lib/writing/feedback-format'
import { WRITING_CRITERION_COLOR as C } from '@/components/writing/criterion-colors'

const SECTION_META: Record<WritingFeedbackCriterion, { label: string; accent: string; soft: string; text: string }> = {
  task_response: { label: 'Task Response / Achievement', ...C.task_response },
  coherence_cohesion: { label: 'Coherence & Cohesion', ...C.coherence_cohesion },
  lexical_resource: { label: 'Lexical Resource', ...C.lexical_resource },
  grammar: { label: 'Grammatical Range & Accuracy', ...C.grammar },
  general: { label: 'Nhận xét tổng quan', ...C.general },
}

const EMPHASIS_RE =
  /(“[^”]{1,180}”|"[^"\n]{1,180}"|Band\s+[0-9](?:\.[05])?|Tuy nhiên|Dù vậy|Vì vậy|Do đó|Điểm mạnh|Điểm cần cải thiện|Hạn chế|Chưa đạt|Để đạt|Cần cải thiện|Ví dụ)/giu

function EmphasizedText({ value }: { value: string }) {
  const parts = value.split(EMPHASIS_RE)
  return parts.map((part, index): ReactNode => {
    if (!part) return null
    if (/^[“"]/.test(part)) {
      return (
        <span key={index} className="font-semibold text-[#5F46BD]">
          {part}
        </span>
      )
    }
    if (EMPHASIS_RE.test(part)) {
      EMPHASIS_RE.lastIndex = 0
      return (
        <strong key={index} className="font-extrabold text-[#2A2740]">
          {part}
        </strong>
      )
    }
    EMPHASIS_RE.lastIndex = 0
    return part
  })
}

export function WritingFeedback({ feedback, compact = false }: { feedback: string; compact?: boolean }) {
  const sections = parseWritingFeedback(feedback)
  if (sections.length === 0) return null

  return (
    <div className={compact ? 'grid gap-2.5' : 'grid gap-3 md:grid-cols-2'}>
      {sections.map((section, sectionIndex) => {
        const meta = SECTION_META[section.criterion]
        return (
          <article
            key={`${section.criterion}-${sectionIndex}`}
            className={`rounded-[18px] border border-[#ECE7F3] border-l-4 bg-white shadow-[0_12px_28px_-24px_rgba(42,39,64,0.55)] ${
              compact ? 'p-3.5' : 'p-4 sm:p-5'
            } ${section.criterion === 'general' && !compact ? 'md:col-span-2' : ''}`}
            style={{ borderLeftColor: meta.accent }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="mt-0.5 h-2.5 w-2.5 flex-none rounded-full"
                  style={{ backgroundColor: meta.accent, boxShadow: `0 0 0 5px ${meta.soft}` }}
                />
                <h5 className={`${compact ? 'text-[12.5px]' : 'text-sm'} font-extrabold leading-snug text-[#2A2740]`}>
                  {meta.label}
                </h5>
              </div>
              {section.band != null && (
                <span
                  className="flex-none rounded-full px-2.5 py-1 text-xs font-extrabold"
                  style={{ backgroundColor: meta.soft, color: meta.text }}
                >
                  Band {section.band.toFixed(1)}
                </span>
              )}
            </div>

            <ul className={`${compact ? 'mt-2.5 space-y-2' : 'mt-3.5 space-y-2.5'}`}>
              {section.points.map((point, pointIndex) => (
                <li
                  key={pointIndex}
                  className={`grid grid-cols-[8px_minmax(0,1fr)] gap-2.5 text-[#514B63] ${
                    compact ? 'text-xs leading-[1.55]' : 'text-[13.5px] leading-[1.65]'
                  }`}
                >
                  <span className="mt-[0.58em] h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.accent }} />
                  <span>
                    <EmphasizedText value={point} />
                  </span>
                </li>
              ))}
            </ul>
          </article>
        )
      })}
    </div>
  )
}
