// ============================================================
// AI-002 — Chọn provider chấm Writing PHẢI tường minh. Trước đây WRITING_AI_PROVIDER đặt sai (typo/
//   provider không hỗ trợ) bị BỎ QUA ÂM THẦM rồi tự chọn provider theo key có sẵn → chấm bằng provider
//   NGOÀI dự kiến (chi phí/hành vi lạ). Fix: config lạ → { ok:false } → gradeWriting fail-loud
//   (AI_UNAVAILABLE), KHÔNG âm thầm đổi provider. Chỉ tự chọn theo key khi WRITING_AI_PROVIDER KHÔNG set.
// AI-001 — Deadline ứng dụng cho lời gọi provider (Anthropic SDK signal / OpenAI fetch). GRADE_TIMEOUT_MS
//   phải NHỎ HƠN platform function timeout để hang → AI_UNAVAILABLE + refund/release claim (bounded), thay
//   vì treo tới khi platform giết hàm (giữ quota/claim). Owner chỉnh qua WRITING_GRADER_TIMEOUT_MS.
// PURE: không 'server-only', không import — Node type-strip test trực tiếp được.
// ============================================================

export type AiProvider = 'anthropic' | 'openai'
export type ProviderSelection =
  | { ok: true; provider: AiProvider; reason: 'explicit' | 'key' | 'default' }
  | { ok: false; reason: 'invalid_config' }

type EnvLike = Record<string, string | undefined>

const DEFAULT_GRADE_TIMEOUT_MS = 60_000 // 60s — dưới platform timeout; Owner chỉnh theo SLA provider
const MIN_GRADE_TIMEOUT_MS = 1_000
const MAX_GRADE_TIMEOUT_MS = 290_000 // trần an toàn (< Vercel Pro 300s maxDuration)

// Deadline (ms) cho 1 lần gọi provider. Đọc lúc gọi để test/dev override được. Giá trị lạ → mặc định.
export function gradeTimeoutMs(env: EnvLike = process.env): number {
  const raw = env.WRITING_GRADER_TIMEOUT_MS
  if (raw == null || raw.trim() === '') return DEFAULT_GRADE_TIMEOUT_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < MIN_GRADE_TIMEOUT_MS) return DEFAULT_GRADE_TIMEOUT_MS
  return Math.min(n, MAX_GRADE_TIMEOUT_MS)
}

// Chọn provider TƯỜNG MINH. WRITING_AI_PROVIDER set → chỉ nhận 'openai'|'anthropic' (trim+lowercase);
//   giá trị khác → { ok:false, invalid_config } (fail-loud, KHÔNG đổi provider). Không set → theo key.
export function selectProvider(env: EnvLike = process.env): ProviderSelection {
  const rawP = env.WRITING_AI_PROVIDER
  if (rawP != null && rawP.trim() !== '') {
    const p = rawP.trim().toLowerCase()
    if (p === 'openai' || p === 'anthropic') return { ok: true, provider: p, reason: 'explicit' }
    return { ok: false, reason: 'invalid_config' } // typo/không hỗ trợ → fail-loud
  }
  // Không cấu hình tường minh → tự chọn theo key có sẵn (anthropic ưu tiên).
  if (env.ANTHROPIC_API_KEY) return { ok: true, provider: 'anthropic', reason: 'key' }
  if (env.OPENAI_API_KEY) return { ok: true, provider: 'openai', reason: 'key' }
  return { ok: true, provider: 'anthropic', reason: 'default' } // không key: nhánh live throw → AI_UNAVAILABLE
}
