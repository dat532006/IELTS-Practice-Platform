import { z } from 'zod'

// ============================================================
// AI-005 — Hợp đồng DỮ LIỆU của grade Writing: Zod (nguồn sự thật) + schema 2 provider, ĐỂ CHUNG 1 CHỖ
//   để không drift. Trước đây 3 bản nằm rải trong writing-grader.ts (server-only) → không test Node
//   trực tiếp được, và thêm field là phải nhớ sửa đúng 3 nơi.
// PURE: không 'server-only', không alias '@/' (Node type-strip KHÔNG resolve được alias) → smoke import
//   module PRODUCTION này trực tiếp. Chỉ import 'zod' (Node resolve node_modules bình thường).
//
// LUẬT THÉP W10 — KHÔNG có field `overall` ở BẤT KỲ schema nào: overall_band do SERVER tính
//   (lib/scoring/writing-band.ts, task1×1/3 + task2×2/3). AiGradeSchema là .strict() nên model có cố
//   nhét `overall_band` vào cũng bị REJECT. Đây là chống AI tự gộp điểm cho người trả tiền.
// ============================================================

export const ErrorHighlight = z.object({
  quote: z.string().min(1).max(240),
  type: z.enum(['task_response', 'coherence_cohesion', 'lexical_resource', 'grammar']),
  suggestion: z.string().min(1).max(500),
}).strict()

// AI-005: bảng "vocabulary upgrade" — từ/cụm ĐÁNG HỌC xuất hiện trong corrected_version.
//   level là ENUM (không phải string tự do) → UI hiển thị nhãn ổn định, không nhận rác kiểu "advanced".
export const VocabUpgrade = z.object({
  word: z.string().min(1).max(120),
  level: z.enum(['B2', 'C1', 'C2']),
  meaning_vi: z.string().min(1).max(300),
  why: z.string().min(1).max(400),
  example: z.string().min(1).max(400),
}).strict()

const TaskCriteria = z.object({
  task_response: z.number(),
  coherence_cohesion: z.number(),
  lexical_resource: z.number(),
  grammar: z.number(),
}).strict()

// Cap độ dài corrected_version: bài Task 2 dài nhất ~400 từ ≈ 2.4k ký tự; 8k là rộng rãi mà vẫn chặn
//   model "viết luận" nuốt token/phình DB. Vượt → Zod reject → AI_INVALID_OUTPUT (fail-closed, refund).
const MAX_CORRECTED_CHARS = 8000
const MAX_VOCAB_ITEMS = 10

export const TaskGrade = z.object({
  band: z.number(),
  criteria: TaskCriteria,
  feedback: z.string().max(4000),
  suggestions: z.array(z.string().max(600)).max(8),
  error_highlights: z.array(ErrorHighlight).max(12).optional(),
  // optional: Anthropic (đường lui) được phép bỏ qua, và bài chấm CŨ trong DB không có field này.
  corrected_version: z.string().max(MAX_CORRECTED_CHARS).optional(),
  vocabulary_upgrades: z.array(VocabUpgrade).max(MAX_VOCAB_ITEMS).optional(),
}).strict()

export const AiGradeSchema = z.object({ task1: TaskGrade, task2: TaskGrade }).strict()
export type RawAiGrade = z.infer<typeof AiGradeSchema>

// ---- Schema cho Anthropic tool use (đường lui). KHÔNG ép field mới vào required. ----
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
const VOCAB_JSON = {
  type: 'object',
  additionalProperties: false,
  properties: {
    word: { type: 'string', description: 'Word or phrase used in corrected_version that is worth learning.' },
    level: { type: 'string', enum: ['B2', 'C1', 'C2'] },
    meaning_vi: { type: 'string', description: 'Vietnamese meaning.' },
    why: { type: 'string', description: 'Vietnamese: why it fits this particular essay.' },
    example: { type: 'string', description: 'English example sentence.' },
  },
  required: ['word', 'level', 'meaning_vi', 'why', 'example'],
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
    corrected_version: { type: 'string' },
    vocabulary_upgrades: { type: 'array', items: VOCAB_JSON, maxItems: MAX_VOCAB_ITEMS },
  },
  required: ['band', 'criteria', 'feedback', 'suggestions'],
}
export const GRADE_INPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: { task1: TASK_JSON, task2: TASK_JSON },
  required: ['task1', 'task2'],
}

// ---- Schema cho OpenAI Structured Outputs (strict). ----
// Strict mode: MỌI property PHẢI có trong `required`, nếu không API trả 400. Mảng rỗng/chuỗi rỗng là
//   cách model "bỏ qua". maxItems KHÔNG dùng (vài phiên bản API từ chối keyword) — giới hạn 8/12/10
//   vẫn được ENFORCE bởi Zod sau parse.
const OPENAI_ERROR_HIGHLIGHT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    quote: { type: 'string', description: 'Exact short quote (≤240 chars) from the candidate response containing the issue.' },
    type: { type: 'string', enum: ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammar'] },
    suggestion: { type: 'string', description: 'Concrete correction or improvement suggestion.' },
  },
  required: ['quote', 'type', 'suggestion'],
}
const OPENAI_VOCAB = {
  type: 'object',
  additionalProperties: false,
  properties: {
    word: { type: 'string', description: 'Word or phrase used in corrected_version that is worth learning.' },
    level: { type: 'string', enum: ['B2', 'C1', 'C2'] },
    meaning_vi: { type: 'string', description: 'Vietnamese meaning.' },
    why: { type: 'string', description: 'Vietnamese: why it fits this particular essay.' },
    example: { type: 'string', description: 'English example sentence.' },
  },
  required: ['word', 'level', 'meaning_vi', 'why', 'example'],
}
const OPENAI_TASK_JSON = {
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
    error_highlights: { type: 'array', items: OPENAI_ERROR_HIGHLIGHT },
    corrected_version: { type: 'string', description: 'Version A — corrected rewrite of the candidate essay (English).' },
    vocabulary_upgrades: { type: 'array', items: OPENAI_VOCAB },
  },
  required: ['band', 'criteria', 'feedback', 'suggestions', 'error_highlights', 'corrected_version', 'vocabulary_upgrades'],
}
export const OPENAI_GRADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { task1: OPENAI_TASK_JSON, task2: OPENAI_TASK_JSON },
  required: ['task1', 'task2'],
}
