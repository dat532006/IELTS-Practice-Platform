export type WritingFeedbackCriterion =
  | 'task_response'
  | 'coherence_cohesion'
  | 'lexical_resource'
  | 'grammar'
  | 'general'

export type WritingFeedbackSection = {
  criterion: WritingFeedbackCriterion
  band?: number
  points: string[]
}

const HEADING_RE =
  /(?:^|\s)(Task\s+(?:Response|Achievement)(?:\s*\/\s*Achievement)?|Coherence\s*(?:&|and)\s*Cohesion|Lexical\s+Resource|Grammatical\s+Range\s*(?:&|and)\s*Accuracy|Grammar)\s*(?:\(\s*)?(?:Band\s*)?([0-9](?:\.[05])?)?(?:\s*\))?\s*:\s*/gim

const CUE_RE =
  /\s+(?=(?:Tuy nhiên|Dù vậy|Vì vậy|Do đó|Điểm mạnh|Điểm cần cải thiện|Hạn chế|Chưa đạt|Để đạt|Cần cải thiện|Ví dụ)\b)/giu

function criterionFromLabel(label: string): WritingFeedbackCriterion {
  const value = label.toLowerCase()
  if (value.startsWith('task ')) return 'task_response'
  if (value.startsWith('coherence')) return 'coherence_cohesion'
  if (value.startsWith('lexical')) return 'lexical_resource'
  if (value.startsWith('grammar') || value.startsWith('grammatical')) return 'grammar'
  return 'general'
}

function sentenceChunks(value: string): string[] {
  const sentences = value.match(/[^.!?]+(?:[.!?]+[”"']*|$)/gu)?.map((item) => item.trim()).filter(Boolean) ?? []
  if (sentences.length <= 1) return value ? [value] : []

  const chunks: string[] = []
  let current = ''
  let sentenceCount = 0
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (current && (next.length > 260 || sentenceCount >= 2)) {
      chunks.push(current)
      current = sentence
      sentenceCount = 1
    } else {
      current = next
      sentenceCount += 1
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function toPoints(value: string): string[] {
  return value
    .replace(CUE_RE, '\n')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .flatMap(sentenceChunks)
}

export function parseWritingFeedback(feedback: string): WritingFeedbackSection[] {
  const normalized = feedback
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/^\s*#{1,4}\s*/gm, '')
    .trim()

  if (!normalized) return []

  const matches = [...normalized.matchAll(HEADING_RE)]
  if (matches.length === 0) {
    return [{ criterion: 'general', points: toPoints(normalized) }]
  }

  const sections: WritingFeedbackSection[] = []
  const beforeFirst = normalized.slice(0, matches[0].index).trim()
  if (beforeFirst) sections.push({ criterion: 'general', points: toPoints(beforeFirst) })

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? normalized.length
    const points = toPoints(normalized.slice(start, end).trim())
    const parsedBand = match[2] ? Number(match[2]) : undefined
    sections.push({
      criterion: criterionFromLabel(match[1]),
      band: parsedBand != null && parsedBand >= 0 && parsedBand <= 9 ? parsedBand : undefined,
      points,
    })
  })

  return sections.filter((section) => section.points.length > 0)
}
