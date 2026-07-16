// ============================================================
// AI-003 — Hợp đồng OpenAI Responses API cho grader Writing.
// Vì sao tách file: gpt-5.6-* (sol/terra/luna) là REASONING model — reasoning token TÍNH VÀO
//   max_output_tokens. Code cũ dùng chung hằng MAX_TOKENS=4000 với Anthropic → reasoning nuốt sạch
//   budget trước khi kịp sinh JSON → status:'incomplete', KHÔNG có output_text → chấm Writing LUÔN
//   hỏng. OpenAI khuyến nghị chừa TỐI THIỂU 25.000 token cho reasoning+output.
//   (Anthropic KHÔNG bị: max_tokens của nó không bao thinking theo cách này → giữ nguyên MAX_TOKENS.)
// AI-002 precedent: config lạ (typo effort) → fail-loud, KHÔNG âm thầm đổi → chi phí/chất lượng
//   ngoài dự kiến. effort là NÚT VẶN CHI PHÍ của Owner: reasoning token tính giá như output token.
// PURE: không 'server-only', không import → Node type-strip test trực tiếp (như provider-select.ts).
// ============================================================

type EnvLike = Record<string, string | undefined>

// Docs GPT-5.6: reasoning.effort ∈ none|low|medium|high|xhigh|max; mặc định API = medium.
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const VALID_EFFORTS: readonly string[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max']
const DEFAULT_EFFORT: ReasoningEffort = 'medium' // = mặc định OpenAI → không bất ngờ khi chưa cấu hình

export type EffortSelection = { ok: true; effort: ReasoningEffort } | { ok: false; reason: 'invalid_config' }

// Khuyến nghị OpenAI: chừa ≥25k cho reasoning+output khi bắt đầu. Đặt sàn ở đây để cấu hình quá nhỏ
//   (vd 4000 của bug cũ) KHÔNG BAO GIỜ lọt xuống provider → không tái diễn incomplete âm thầm.
export const OPENAI_MIN_RESERVED_REASONING_TOKENS = 25_000
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000 // 25k reasoning + ~7k JSON grade (2 task × 4 tiêu chí + highlights)
const MODEL_MAX_OUTPUT_TOKENS = 128_000 // trần gpt-5.6-terra — gửi quá → provider 400

// Budget output cho 1 lần chấm. Giá trị lạ/dưới sàn → mặc định; vượt trần model → clamp.
//   Cùng idiom với gradeTimeoutMs (lib/ai/provider-select.ts): đọc lúc gọi để test/dev override được.
export function openaiMaxOutputTokens(env: EnvLike = process.env): number {
  const raw = env.WRITING_GRADER_OPENAI_MAX_OUTPUT_TOKENS
  if (raw == null || raw.trim() === '') return DEFAULT_MAX_OUTPUT_TOKENS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < OPENAI_MIN_RESERVED_REASONING_TOKENS) return DEFAULT_MAX_OUTPUT_TOKENS
  return Math.min(Math.floor(n), MODEL_MAX_OUTPUT_TOKENS)
}

// Chọn effort TƯỜNG MINH. Không set → medium (mặc định OpenAI). Giá trị lạ → fail-loud (AI-002),
//   KHÔNG rơi về medium âm thầm: Owner đặt 'lo' thay 'low' phải biết, vì đó là tiền.
export function openaiReasoningEffort(env: EnvLike = process.env): EffortSelection {
  const raw = env.WRITING_GRADER_OPENAI_REASONING_EFFORT
  if (raw == null || raw.trim() === '') return { ok: true, effort: DEFAULT_EFFORT }
  const e = raw.trim().toLowerCase()
  if (VALID_EFFORTS.includes(e)) return { ok: true, effort: e as ReasoningEffort }
  return { ok: false, reason: 'invalid_config' }
}

export type OpenAiUsage = { input_tokens?: number; output_tokens?: number }
export type ParsedOpenAi =
  | { ok: true; json: unknown; usage: OpenAiUsage }
  | { ok: false; code: 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT'; reason: string }

type ResponseItem = { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }
type ResponseBody = {
  status?: string
  incomplete_details?: { reason?: string }
  output?: ResponseItem[]
  usage?: OpenAiUsage
}

// reason đi vào log → PHẢI là nhãn cố định, không bao giờ mang dữ liệu. incomplete_details.reason do
//   provider trả (không kiểm soát) → chuẩn hoá cứng về [a-z_] + cắt ngắn trước khi ghép.
function safeLabel(v: unknown): string {
  return String(v ?? 'unknown').toLowerCase().replace(/[^a-z_]/g, '_').slice(0, 40) || 'unknown'
}

// Bóc kết quả Responses API. Phân biệt được:
//   • incomplete (budget/filter) → AI_UNAVAILABLE (retry được; caller refund quota + release claim)
//   • refusal                    → AI_UNAVAILABLE
//   • thiếu output_text / JSON hỏng → AI_INVALID_OUTPUT
//   Reasoning model trả item type:'reasoning' TRƯỚC message → chỉ lấy item type:'message'.
export function parseOpenAiResponse(body: unknown): ParsedOpenAi {
  if (!body || typeof body !== 'object') return { ok: false, code: 'AI_INVALID_OUTPUT', reason: 'empty_body' }
  const b = body as ResponseBody

  // Trước đây KHÔNG kiểm status → truncation lẫn vào "invalid output" → Owner không biết vì sao hỏng.
  if (b.status === 'incomplete') {
    return { ok: false, code: 'AI_UNAVAILABLE', reason: `incomplete_${safeLabel(b.incomplete_details?.reason)}` }
  }

  const content = (b.output ?? []).filter((i) => i?.type === 'message').flatMap((i) => i.content ?? [])
  if (content.some((c) => c?.type === 'refusal' || c?.refusal)) {
    return { ok: false, code: 'AI_UNAVAILABLE', reason: 'refusal' }
  }
  const outputText = content.find((c) => c?.type === 'output_text')?.text
  if (!outputText) return { ok: false, code: 'AI_INVALID_OUTPUT', reason: 'no_output_text' }

  try {
    return { ok: true, json: JSON.parse(outputText), usage: b.usage ?? {} }
  } catch {
    return { ok: false, code: 'AI_INVALID_OUTPUT', reason: 'bad_json' }
  }
}
