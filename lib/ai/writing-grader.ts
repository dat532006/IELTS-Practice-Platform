import 'server-only'
import { z } from 'zod'
import { isValidBand, roundHalf } from '@/lib/scoring/writing-band'

// ============================================================
// W10 — Writing AI grader (M07). SERVER-ONLY.
// LUẬT THÉP: ANTHROPIC_API_KEY chỉ server env (KHÔNG NEXT_PUBLIC_, KHÔNG log, KHÔNG ra client).
//   AI output KHÔNG tin tuyệt đối → Zod parse + validate band [0..9]/step 0.5; fail = KHÔNG dùng.
//   KHÔNG tin overall do AI trả (server compute ở lib/exam/writing.ts).
// Provider = Anthropic SDK (claude-api skill). Model default claude-opus-4-8 (env override).
//   Thiếu API key / WRITING_GRADER_MOCK=1 → MOCK deterministic (KHÔNG claim live).
// ============================================================

const MODEL = process.env.WRITING_GRADER_MODEL || 'claude-opus-4-8'
const MAX_TOKENS = 4000

// Criteria band cho 1 task (IELTS 4 tiêu chí). band number thô — validate sau parse.
const TaskCriteria = z.object({
  task_response: z.number(),
  coherence_cohesion: z.number(),
  lexical_resource: z.number(),
  grammar: z.number(),
})
const TaskGrade = z.object({
  band: z.number(),
  criteria: TaskCriteria,
  feedback: z.string().max(4000),
  suggestions: z.array(z.string().max(600)).max(8),
})
export const AiGradeSchema = z.object({ task1: TaskGrade, task2: TaskGrade })
export type RawAiGrade = z.infer<typeof AiGradeSchema>

// JSON schema cho Claude tool use (structured input). Zod (project = v3) vẫn validate lại output.
const GRADE_TOOL = 'submit_grade'
const TASK_JSON = {
  type: 'object',
  additionalProperties: false,
  properties: {
    band: { type: 'number' },
    criteria: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_response: { type: 'number' },
        coherence_cohesion: { type: 'number' },
        lexical_resource: { type: 'number' },
        grammar: { type: 'number' },
      },
      required: ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammar'],
    },
    feedback: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['band', 'criteria', 'feedback', 'suggestions'],
}
const GRADE_INPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: { task1: TASK_JSON, task2: TASK_JSON },
  required: ['task1', 'task2'],
}

export type GraderInput = {
  task1_prompt: string
  task2_prompt: string
  task1_text: string
  task2_text: string
}
export type GradeOutcome =
  | { ok: true; grade: RawAiGrade; mock: boolean }
  | { ok: false; code: 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT' }

const SYSTEM_PROMPT = [
  'You are a certified IELTS Writing examiner. Grade Task 1 and Task 2 separately.',
  'For EACH task return four criterion bands (task_response, coherence_cohesion, lexical_resource, grammar)',
  'and an overall band for that task, plus concise feedback and 2–4 actionable suggestions.',
  'All band scores MUST be in the range 0 to 9 in steps of 0.5 (e.g. 6.0, 6.5).',
  'Do NOT compute a combined overall across the two tasks — that is done elsewhere.',
  'Base the grade only on the candidate text provided; never invent content.',
].join(' ')

// Validate + chuẩn hoá band sau khi có RawAiGrade (range + step). Reject nếu sai.
function bandsValid(g: RawAiGrade): boolean {
  const tasks = [g.task1, g.task2]
  for (const t of tasks) {
    if (!isValidBand(t.band)) return false
    for (const v of Object.values(t.criteria)) if (!isValidBand(v)) return false
  }
  return true
}

// ---- MOCK (deterministic theo word count) — testable không cần API key ----
function mockGrade(input: GraderInput): RawAiGrade {
  const wc = (s: string) => (s.trim().match(/\S+/g) ?? []).length
  const bandFor = (n: number, floor: number) => roundHalf(Math.min(7.5, Math.max(4, floor + n / 200)))
  const task = (text: string, floor: number) => {
    const b = bandFor(wc(text), floor)
    return {
      band: b,
      criteria: { task_response: b, coherence_cohesion: b, lexical_resource: b, grammar: b },
      feedback: '[MOCK] Deterministic placeholder feedback (AI grader not configured).',
      suggestions: ['[MOCK] Add more specific examples.', '[MOCK] Vary sentence structures.'],
    }
  }
  return { task1: task(input.task1_text, 4.5), task2: task(input.task2_text, 4.5) }
}

function useMock(): boolean {
  return process.env.WRITING_GRADER_MOCK === '1' || !process.env.ANTHROPIC_API_KEY
}

export async function gradeWriting(input: GraderInput): Promise<GradeOutcome> {
  if (useMock()) {
    const grade = mockGrade(input)
    return bandsValid(grade) ? { ok: true, grade, mock: true } : { ok: false, code: 'AI_INVALID_OUTPUT' }
  }

  // ---- LIVE: Anthropic SDK (tool use + adaptive thinking). Secret chỉ ở env. ----
  // Dùng tool use (TaskBrief Task 10.2): tool đảm bảo JSON có cấu trúc; Zod (v3) + bandsValid validate lại.
  //   Tránh helpers/zod (helper SDK target zod v4, project = zod v3 → mismatch type).
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic() // đọc ANTHROPIC_API_KEY từ env (server-only)
    const userContent = [
      `TASK 1 PROMPT:\n${input.task1_prompt}`,
      `TASK 1 RESPONSE:\n${input.task1_text}`,
      `TASK 2 PROMPT:\n${input.task2_prompt}`,
      `TASK 2 RESPONSE:\n${input.task2_text}`,
      `Call the ${GRADE_TOOL} tool with the grade. All bands in 0..9, steps of 0.5.`,
    ].join('\n\n')

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      tools: [{ name: GRADE_TOOL, description: 'Return the IELTS writing grade for Task 1 and Task 2.', input_schema: GRADE_INPUT_SCHEMA }],
      tool_choice: { type: 'auto' }, // 'auto' (không force) để tương thích adaptive thinking
    })

    if (res.stop_reason === 'refusal') return { ok: false, code: 'AI_UNAVAILABLE' }
    const toolUse = res.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return { ok: false, code: 'AI_INVALID_OUTPUT' }
    const safe = AiGradeSchema.safeParse(toolUse.input)
    if (!safe.success || !bandsValid(safe.data)) return { ok: false, code: 'AI_INVALID_OUTPUT' }
    return { ok: true, grade: safe.data, mock: false }
  } catch {
    // KHÔNG log secret/chi tiết provider. Fail an toàn.
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }
}
