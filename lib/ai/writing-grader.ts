import 'server-only'
import { isValidBand, roundHalf } from '@/lib/scoring/writing-band'
import { AiGradeSchema, GRADE_INPUT_SCHEMA, OPENAI_GRADE_SCHEMA, type RawAiGrade } from '@/lib/ai/grade-schema'
import { WRITING_GRADER_SYSTEM_PROMPT } from '@/lib/ai/ielts-writing-rubric'
import { selectProvider, gradeTimeoutMs } from '@/lib/ai/provider-select'
import { openaiMaxOutputTokens, openaiReasoningEffort, parseOpenAiResponse } from '@/lib/ai/openai-responses'
import { fetchWithDeadline } from '@/lib/net/fetch-deadline'
import { logEvent } from '@/lib/obs/log-event'

// ============================================================
// W10/W11 — Writing AI grader (M07). SERVER-ONLY.
// LUẬT THÉP: ANTHROPIC_API_KEY / OPENAI_API_KEY chỉ server env (KHÔNG NEXT_PUBLIC_, KHÔNG log, KHÔNG ra client).
//   AI output KHÔNG tin tuyệt đối → Zod parse + validate band [0..9]/step 0.5; fail = KHÔNG dùng.
//   KHÔNG tin overall do AI trả (server compute ở lib/exam/writing.ts).
// W11: prompt caching cho stable rubric/system block + optional bounded error_highlights.
// A2 (2026-07-08, Owner quyết): thêm adapter OpenAI (fetch thuần, không thêm SDK). Chọn provider:
//   WRITING_AI_PROVIDER=openai|anthropic; không set → openai (AI-004: Owner chốt OpenAI 2026-07-16;
//   anthropic là ĐƯỜNG LUI, chọn lại bằng env, không sửa code).
//   Cả 2 provider ĐI QUA CÙNG validateAiGradeOutput — schema/band rule không đổi.
// AI-005 (Owner chốt 2026-07-16): thêm corrected_version (Version A) + vocabulary_upgrades. Hợp đồng dữ
//   liệu (Zod + schema 2 provider) TÁCH sang lib/ai/grade-schema.ts (thuần, test Node trực tiếp được).
//   Output dài hơn hẳn → MAX_TOKENS nâng khỏi 4000 (bài viết lại + bảng vocab không lọt budget cũ).
//   Owner XIN "estimated overall band" từ AI nhưng ĐÃ TỪ CHỐI: server tính (trọng số IELTS 1/3–2/3) là
//   nguồn duy nhất — AI đoán lại phép tính của chính nó chỉ tạo 2 số mâu thuẫn trên màn hình.
// AI-001 (batch 21): mọi lời gọi provider có DEADLINE (gradeTimeoutMs) — Anthropic SDK qua signal +
//   maxRetries:0 (không auto-retry gây nhân đôi chi phí), OpenAI qua fetchWithDeadline. Hang → throw →
//   AI_UNAVAILABLE → lib/exam/writing.ts refund quota + release claim (bounded, cho retry).
// AI-002 (batch 21): chọn provider ở lib/ai/provider-select.ts — WRITING_AI_PROVIDER lạ → fail-loud
//   (KHÔNG âm thầm đổi provider theo key). gradeWriting trả AI_UNAVAILABLE khi config lạ.
// ============================================================

const MODEL = process.env.WRITING_GRADER_MODEL || 'claude-opus-4-8'
const OPENAI_MODEL = process.env.WRITING_GRADER_OPENAI_MODEL || 'gpt-5.6-terra'
// AI-005: Anthropic (đường lui). 4000 cũ KHÔNG đủ từ khi có corrected_version + vocabulary_upgrades
//   (2 bài viết lại + 2 bảng vocab) — thinking cũng tính vào max_tokens → JSON bị cắt giữa chừng.
//   OpenAI có budget RIÊNG (openaiMaxOutputTokens, AI-003) vì reasoning token tính vào max_output_tokens.
const MAX_TOKENS = 16_000

export type GradeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

const GRADE_TOOL = 'submit_grade'

export type GraderInput = {
  task1_prompt: string
  task2_prompt: string
  task1_text: string
  task2_text: string
}
export type GradeOutcome =
  // AI-016: provider/model đi kèm để persist usage + tính chi phí (mock không có).
  | { ok: true; grade: RawAiGrade; mock: boolean; usage?: GradeUsage; provider?: 'openai' | 'anthropic'; model?: string }
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
      // FB-01: mock PHẢI có fix/reason_vi — không thì dev không bao giờ thấy UI diff trước/sau.
      error_highlights: [
        {
          quote: text.trim().split(/\s+/).slice(0, 8).join(' ') || 'sample text',
          type: 'lexical_resource' as const,
          suggestion: '[MOCK] Replace vague wording with more precise vocabulary.',
          fix: `${(text.trim().split(/\s+/).slice(0, 7).join(' ') || 'sample')} precisely`,
          reason_vi: '[MOCK] Cách diễn đạt mơ hồ — thay bằng từ chính xác hơn.',
        },
      ],
      // FB-02: mock sinh improvement_plan để dev thấy UI lộ trình mới (suggestions ở trên là fallback cũ).
      improvement_plan: [
        {
          criterion: 'task_response' as const,
          kind: 'fix' as const,
          priority: 1 as const,
          title_vi: '[MOCK] Thêm ví dụ cụ thể cho luận điểm chính',
          detail_vi: '[MOCK] Sau câu chủ đề, bổ sung một ví dụ thực tế để phát triển ý.',
          example: 'For instance, national parks such as Cuc Phuong have helped species recover.',
        },
        {
          criterion: 'grammar' as const,
          kind: 'keep' as const,
          priority: 3 as const,
          title_vi: '[MOCK] Duy trì câu phức chính xác',
          detail_vi: '[MOCK] Các câu phức hiện tại ít lỗi — tiếp tục phát huy.',
        },
      ],
      // AI-005: mock PHẢI sinh cả field mới — nếu không, dev/test không bao giờ thấy UI Version A/vocab
      //   và lỗi render chỉ lộ ra ở prod (nơi có key thật).
      corrected_version: `[MOCK] ${text.trim().slice(0, 200) || 'Corrected version placeholder.'}`,
      vocabulary_upgrades: [
        {
          word: 'a marked increase',
          level: 'C1' as const,
          meaning_vi: '[MOCK] sự gia tăng rõ rệt',
          why: '[MOCK] thay cho "big increase" bị lặp trong bài.',
          example: 'The chart shows a marked increase in sales.',
        },
      ],
    }
  }
  return { task1: task(input.task1_text, 4.5), task2: task(input.task2_text, 4.5) }
}

// F5 — mock CHỈ khi: (a) bật tường minh WRITING_GRADER_MOCK=1 (test/dev), hoặc (b) thiếu CẢ HAI key AI
//   Ở MÔI TRƯỜNG NON-PROD. Prod thiếu key → KHÔNG mock âm thầm: rơi xuống nhánh LIVE, thiếu key sẽ throw
//   → AI_UNAVAILABLE (fail loud), KHÔNG trả band giả cho người dùng trả tiền.
//   (Tên KHÔNG bắt đầu bằng "use" để tránh eslint react-hooks/rules-of-hooks hiểu nhầm là React hook.)
function mockEnabled(): boolean {
  if (process.env.WRITING_GRADER_MOCK === '1') return true
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) return false
  return process.env.NODE_ENV !== 'production'
}

function buildUserContent(input: GraderInput, toolNote: string): string {
  return [
    `TASK 1 PROMPT:\n${input.task1_prompt}`,
    `TASK 1 RESPONSE:\n${input.task1_text}`,
    `TASK 2 PROMPT:\n${input.task2_prompt}`,
    `TASK 2 RESPONSE:\n${input.task2_text}`,
    toolNote,
  ].join('\n\n')
}

// ---- LIVE: Anthropic SDK (tool use + adaptive thinking). Secret chỉ ở env. ----
// W11 prompt caching: stable rubric/system text is first and marked ephemeral; essay remains variable user content.
async function gradeWithAnthropic(input: GraderInput): Promise<GradeOutcome> {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    // maxRetries:0 — KHÔNG để SDK tự retry (nhân đôi chi phí/claim); retry do người dùng qua release claim.
    const client = new Anthropic({ maxRetries: 0 }) // đọc ANTHROPIC_API_KEY từ env (server-only)
    const userContent = buildUserContent(
      input,
      `Call the ${GRADE_TOOL} tool with the grade. All bands in 0..9, steps of 0.5. Include up to 12 short error_highlights per task when useful (each with fix + reason_vi); omit the field if there are no specific highlights. Also include corrected_version (Version A rewrite), up to 10 vocabulary_upgrades and a 4–8 item improvement_plan per task, as specified in the system instructions.`,
    )

    // AI-001: deadline ứng dụng — quá hạn → AbortSignal.timeout abort → SDK throw → catch → AI_UNAVAILABLE.
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
        tools: [{ name: GRADE_TOOL, description: 'Return the IELTS writing grade for Task 1 and Task 2.', input_schema: GRADE_INPUT_SCHEMA }],
        tool_choice: { type: 'auto' },
      },
      { signal: AbortSignal.timeout(gradeTimeoutMs()) },
    )

    if (res.stop_reason === 'refusal') return { ok: false, code: 'AI_UNAVAILABLE' }
    const toolUse = res.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return { ok: false, code: 'AI_INVALID_OUTPUT' }
    const grade = validateAiGradeOutput(toolUse.input)
    if (!grade) return { ok: false, code: 'AI_INVALID_OUTPUT' }
    return { ok: true, grade, mock: false, usage: res.usage as GradeUsage, provider: 'anthropic', model: MODEL }
  } catch (err) {
    // DEPLOY-005: quan sát được sự cố provider (timeout/mạng) — CHỈ tên lỗi (vd AbortError), KHÔNG
    //   message/secret/essay. Trước đây catch {} nuốt hoàn toàn → chấm điểm hỏng mà không thấy gì.
    logEvent('scoring.provider_error', 'error', { provider: 'anthropic', kind: (err as Error)?.name ?? 'unknown' })
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }
}

// ---- LIVE: OpenAI (A2) — fetch thuần tới /v1/responses + Structured Outputs (json_schema strict).
// KHÔNG thêm SDK dependency. Schema (strict, mọi field required) ở lib/ai/grade-schema.ts cùng chỗ với
// Zod → không drift. Giới hạn 8 suggestions/12 highlights/10 vocab ENFORCE bởi Zod sau parse.
async function gradeWithOpenAi(input: GraderInput): Promise<GradeOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, code: 'AI_UNAVAILABLE' } // fail-loud, không mock âm thầm (F5)
  // AI-003: effort lạ → chặn TRƯỚC khi gọi provider (AI-002 precedent) — không tiêu tiền với config sai.
  const effortSel = openaiReasoningEffort()
  if (!effortSel.ok) {
    logEvent('scoring.provider_error', 'error', { provider: 'openai', kind: 'config', reason: 'invalid_reasoning_effort' })
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }
  try {
    const userContent = buildUserContent(
      input,
      'Return the grade as JSON. All bands in 0..9, steps of 0.5. At most 12 error_highlights (each with fix + reason_vi), 10 vocabulary_upgrades and 8 improvement_plan items per task; use an empty array when there is nothing to list. corrected_version, vocabulary_upgrades and improvement_plan are required fields — follow the system instructions for how to produce them. improvement_plan priority must be exactly 1, 2 or 3.',
    )
    // AI-001: deadline ứng dụng — provider treo → AbortSignal.timeout abort → throw → catch → AI_UNAVAILABLE.
    const res = await fetchWithDeadline('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        // AI-003: budget RIÊNG cho OpenAI — reasoning token tính vào đây; dùng chung MAX_TOKENS (4000)
        //   của Anthropic → reasoning nuốt hết → incomplete → chấm luôn hỏng.
        max_output_tokens: openaiMaxOutputTokens(),
        reasoning: { effort: effortSel.effort },
        instructions: SYSTEM_PROMPT,
        input: userContent,
        text: {
          format: {
            type: 'json_schema',
            name: 'ielts_writing_grade',
            strict: true,
            schema: OPENAI_GRADE_SCHEMA,
          },
        },
      }),
    }, gradeTimeoutMs())
    if (!res.ok) {
      logEvent('scoring.provider_error', 'error', { provider: 'openai', kind: 'http', reason: 'http_error', status: res.status })
      return { ok: false, code: 'AI_UNAVAILABLE' }
    }
    // AI-003: parse ở module thuần → phân biệt incomplete (budget/filter) vs refusal vs JSON hỏng, và
    //   GHI LẠI lý do. Trước đây truncation lẫn vào AI_INVALID_OUTPUT câm → không debug được.
    const parsed = parseOpenAiResponse(await res.json().catch(() => null))
    if (!parsed.ok) {
      logEvent('scoring.provider_error', 'error', { provider: 'openai', kind: 'response', reason: parsed.reason })
      return { ok: false, code: parsed.code }
    }
    const grade = validateAiGradeOutput(parsed.json)
    if (!grade) {
      logEvent('scoring.provider_error', 'error', { provider: 'openai', kind: 'response', reason: 'schema_reject' })
      return { ok: false, code: 'AI_INVALID_OUTPUT' }
    }
    return { ok: true, grade, mock: false, usage: parsed.usage, provider: 'openai', model: OPENAI_MODEL }
  } catch (err) {
    // DEPLOY-005: xem gradeWithAnthropic — chỉ tên lỗi, KHÔNG message/secret/essay.
    logEvent('scoring.provider_error', 'error', { provider: 'openai', kind: (err as Error)?.name ?? 'unknown' })
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }
}

export async function gradeWriting(input: GraderInput): Promise<GradeOutcome> {
  if (mockEnabled()) {
    const grade = validateAiGradeOutput(mockGrade(input))
    return grade ? { ok: true, grade, mock: true } : { ok: false, code: 'AI_INVALID_OUTPUT' }
  }
  // AI-002: config provider lạ → fail-loud (AI_UNAVAILABLE), KHÔNG âm thầm đổi provider theo key.
  const sel = selectProvider()
  if (!sel.ok) return { ok: false, code: 'AI_UNAVAILABLE' }
  return sel.provider === 'openai' ? gradeWithOpenAi(input) : gradeWithAnthropic(input)
}
