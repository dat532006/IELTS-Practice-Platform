// Registry renderer (M06). Chọn component theo question.type; unknown → Fallback (an toàn, không crash).
// KHÔNG biết đáp án / KHÔNG chấm (LUẬT THÉP #2) — chỉ render + thu answer theo question.id.
import { renderKindOf, type QuestionComponentProps } from './types'
import { GapFillQuestion } from './GapFillQuestion'
import { ChoiceQuestion } from './ChoiceQuestion'
import { TrueFalseQuestion } from './TrueFalseQuestion'
import { MatchingQuestion } from './MatchingQuestion'
import { FallbackQuestion } from './FallbackQuestion'

export function QuestionRenderer(props: QuestionComponentProps) {
  const kind = renderKindOf(props.question.type)
  switch (kind) {
    case 'gap':
      return <GapFillQuestion {...props} />
    case 'mcq_single':
      return <ChoiceQuestion {...props} multi={false} />
    case 'mcq_multi':
      return <ChoiceQuestion {...props} multi={true} />
    case 'tfng':
      return <TrueFalseQuestion {...props} variant="tfng" />
    case 'ynng':
      return <TrueFalseQuestion {...props} variant="ynng" />
    case 'matching':
      return <MatchingQuestion {...props} />
    default:
      return <FallbackQuestion {...props} />
  }
}
