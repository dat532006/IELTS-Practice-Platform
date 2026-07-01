import 'server-only'
import { z } from 'zod'
import { isValidBand, roundHalf } from '@/lib/scoring/writing-band'
import { WRITING_GRADER_SYSTEM_PROMPT } from '@/lib/ai/ielts-writing-rubric'

// ============================================================
// W10/W11 — Writing AI grader (M07). SERVER-ONLY.
// LUẬT THÉP: ANTHROPIC_API_KEY chỉ server env (KHÔNG NEXT_PUBLIC_, KHÔNG log, KHÔNG ra client).
//   AI output KHÔNG tin tuyệt đối → Zod parse + validate band [0..9]/step 0.5; fail = KHÔNG dùng.
//   KHÔNG tin overall do AI trả (server compute ở lib/exam/writing.ts).
// W11: prompt caching cho stable rubric/system block + optional bounded error_highlights.
// ============================================================

const MODEL = process.env.WRITING_GRADER_MODEL || 'claude-opus-4-8'
const MAX_TOKENS = 4000

const ErrorHighlight = z.object({
  quote: z.string().min(1).max(240),
  type: z.enum(['task_response', 'coherence_cohesion', 'lexical_resource', 'grammar']),
  suggestion: z.string().min(1).max(500),
}).strict()

// Criteria band cho 1 task (IELTS 4 tiêu chí). band number thô — validate sau parse.
const TaskCriteria = z.object({
  task_response: z.number(),
  coherence_cohesion: z.number(),
  lexical_resource: z.number(),
  grammar: z.number(),
}).strict()
const TaskGrade = z.object({
  band: z.number(),
  criteria: TaskCriteria,
  feedback: z.string().max(4000),
  suggestions: z.array(z.string().max(600)).max(8),
  error_highlights: z.array(ErrorHighlight).max(12).optional(),
}).strict()
export const AiGradeSchema = z.object({ task1: TaskGrade, task2: TaskGrade }).strict()
export type RawAiGrade = z.infer<typeof AiGradeSchema>

export type GradeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// JSON schema cho Claude tool use (structured input). Zod (project = v3) vẫn validate lại output.
const GRADE_TOOL = 'submit_grade'
const ERROR_HIGHLIGHT_JSON = {
  type: 'object',
  additionalProperties: false,
  properties: {
    quote: { type: 'string', description: 'Exact short quote from the candidate response containing the issue.' },
    type: { type: 'string', enum: ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammar'] },
    suggestion: { type: 'string', description: 'Concrete correction or improvement suggestion.' },
  },
  required: ['quote', 'type', 'suggestion'],
}
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
    suggestions: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    error_highlights: { type: 'array', items: ERROR_HIGHLIGHT_JSON, maxItems: 12 },
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
  | { ok: true; grade: RawAiGrade; mock: boolean; usage?: GradeUsage }
  | { ok: false; code: 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT' }

// System prompt = official IELTS band descriptors + scoring rules (lib/ai/ielts-writing-rubric.ts).
const SYSTEM_PROMPT = WRITING_GRADER_SYSTEM_PROMPT

export function validateAiGradeOutput(input: unknown): RawAiGrade | null {
  const safe = AiGradeSchema.safeParse(input)
  if (!safe.success || !bandsValid(safe.data)) return null
  return safe.data
}

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
      error_highlights: [
        {
          quote: text.trim().split(/\s+/).slice(0, 8).join(' ') || 'sample text',
          type: 'lexical_resource' as const,
          suggestion: '[MOCK] Replace vague wording with more precise vocabulary.',
        },
      ],
    }
  }
  return { task1: task(input.task1_text, 4.5), task2: task(input.task2_text, 4.5) }
}

// F5 — mock CHỈ khi: (a) bật tường minh WRITING_GRADER_MOCK=1 (test/dev), hoặc (b) thiếu ANTHROPIC_API_KEY
//   Ở MÔI TRƯỜNG NON-PROD. Prod thiếu key → KHÔNG mock âm thầm: rơi xuống nhánh LIVE, SDK thiếu key sẽ throw
//   → AI_UNAVAILABLE (fail loud), KHÔNG trả band giả cho người dùng trả tiền.
//   (Tên KHÔNG bắt đầu bằng "use" để tránh eslint react-hooks/rules-of-hooks hiểu nhầm là React hook.)
function mockEnabled(): boolean {
  if (process.env.WRITING_GRADER_MOCK === '1') return true
  if (process.env.ANTHROPIC_API_KEY) return false
  return process.env.NODE_ENV !== 'production'
}

export async function gradeWriting(input: GraderInput): Promise<GradeOutcome> {
  if (mockEnabled()) {
    const grade = validateAiGradeOutput(mockGrade(input))
    return grade ? { ok: true, grade, mock: true } : { ok: false, code: 'AI_INVALID_OUTPUT' }
  }

  // ---- LIVE: Anthropic SDK (tool use + adaptive thinking). Secret chỉ ở env. ----
  // W11 prompt caching: stable rubric/system text is first and marked ephemeral; essay remains variable user content.
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic() // đọc ANTHROPIC_API_KEY từ env (server-only)
    const userContent = [
      `TASK 1 PROMPT:\n${input.task1_prompt}`,
      `TASK 1 RESPONSE:\n${input.task1_text}`,
      `TASK 2 PROMPT:\n${input.task2_prompt}`,
      `TASK 2 RESPONSE:\n${input.task2_text}`,
      `Call the ${GRADE_TOOL} tool with the grade. All bands in 0..9, steps of 0.5. Include up to 12 short error_highlights per task when useful; omit the field if there are no specific highlights.`,
    ].join('\n\n')

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      tools: [{ name: GRADE_TOOL, description: 'Return the IELTS writing grade for Task 1 and Task 2.', input_schema: GRADE_INPUT_SCHEMA }],
      tool_choice: { type: 'auto' },
    })

    if (res.stop_reason === 'refusal') return { ok: false, code: 'AI_UNAVAILABLE' }
    const toolUse = res.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return { ok: false, code: 'AI_INVALID_OUTPUT' }
    const grade = validateAiGradeOutput(toolUse.input)
    if (!grade) return { ok: false, code: 'AI_INVALID_OUTPUT' }
    return { ok: true, grade, mock: false, usage: res.usage as GradeUsage }
  } catch {
    // KHÔNG log secret/chi tiết provider. Fail an toàn.
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }
}
