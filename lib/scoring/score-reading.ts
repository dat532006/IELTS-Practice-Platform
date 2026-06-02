// ============================================================
// W6 — Reading scoring (M05/M06). PURE, deterministic, server-side.
// Source of truth = answer_keys.keys (lặp theo KEY, KHÔNG theo answers client →
//   chống nhồi question.id lạ; câu thiếu đáp án client = empty = 0 điểm rõ ràng).
// Hỗ trợ: gap filling (nhiều đáp án hợp lệ), MCQ single, MCQ multi (canonical order),
//   TF/NG, YN/NG. answer_keys KHÔNG bao giờ ra client (LUẬT THÉP #2) — file này chỉ chạy server.
//
// FIX (Leader review P2a): VALIDATE từng answer key bằng Zod trước khi chấm.
//   - answers: mảng string non-empty (bắt buộc); points: số NGUYÊN dương (raw_score là smallint);
//     match: 'ci'|'exact'; type (nếu có) phải thuộc ALLOWED_KEY_TYPES.
//   - Key sai cấu trúc / type lạ (typo) → KHÔNG chấm âm thầm: bỏ qua + liệt kê ở invalid_question_ids
//     (route → meta.warnings 'ANSWER_KEYS_INVALID'); không để raw fractional, không 500.
// ============================================================

import { z } from 'zod'
import { normalizeAnswer, type MatchMode } from './normalize'

// Các dạng được scoring hỗ trợ (single-value, trừ mcq_multi = set). Type lạ → key invalid (không single-hóa âm thầm).
export const ALLOWED_KEY_TYPES = [
  'gap',
  'gap_filling',
  'summary',
  'summary_completion',
  'sentence_completion',
  'short_answer',
  'note_completion',
  'table_completion',
  'mcq',
  'mcq_single',
  'mcq_multi',
  'tfng',
  'tf_ng',
  'true_false_notgiven',
  'ynng',
  'yn_ng',
  'yes_no_notgiven',
  'matching',
  'matching_headings',
  'matching_information',
  'matching_features',
  'matching_endings',
] as const

const AnswerKeyEntrySchema = z.object({
  type: z.enum(ALLOWED_KEY_TYPES).optional(),
  answers: z.array(z.string().min(1).max(200)).min(1).max(20),
  match: z.enum(['ci', 'exact']).optional(),
  points: z.number().int().positive().max(20).optional(),
})

export type AnswerKeyEntry = z.infer<typeof AnswerKeyEntrySchema>
export type AnswerKeys = Record<string, unknown> // raw (chưa validate) — validate per-entry trong scoreReading

export type QuestionScore = { question_id: string; correct: boolean; points: number }
export type ReadingScore = {
  raw_score: number
  max_score: number
  correct_count: number
  total: number // số key hợp lệ đã chấm
  invalid_question_ids: string[] // key bị loại do sai cấu trúc/type
  details: QuestionScore[] // ⚠️ INTERNAL — KHÔNG serialize ra client
}

const matchOf = (key: AnswerKeyEntry): MatchMode => (key.match === 'exact' ? 'exact' : 'ci')

// userAnswer cho multi-select có thể là array; chuẩn hóa về string[].
function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (x == null ? '' : String(x)))
  if (v == null) return []
  return [String(v)]
}

// Multi-select coi userAnswer như array; nếu single nhận nhầm array → ép về 1 chuỗi.
function toScalar(v: unknown): unknown {
  if (Array.isArray(v)) return v.length === 1 ? v[0] : v.join(', ')
  return v
}

// canonical SET: normalize → bỏ rỗng → dedupe → sort (độc lập thứ tự = canonical order).
function canonicalSet(list: string[], match: MatchMode): string[] {
  return Array.from(new Set(list.map((s) => normalizeAnswer(s, match)).filter((s) => s !== ''))).sort()
}

export function isAnswerCorrect(userAnswer: unknown, key: AnswerKeyEntry): boolean {
  const match = matchOf(key)
  const accepted = key.answers

  if (key.type === 'mcq_multi') {
    const want = canonicalSet(accepted, match)
    if (want.length === 0) return false
    const got = canonicalSet(toArray(userAnswer), match)
    if (got.length !== want.length) return false
    return got.every((g, i) => g === want[i])
  }

  // single-value: gap_filling / mcq_single / tfng / ynng / summary / matching / default
  const got = normalizeAnswer(toScalar(userAnswer), match)
  if (got === '') return false // empty answer → sai (tính rõ ràng)
  const acc = accepted.map((a) => normalizeAnswer(a, match))
  return acc.includes(got)
}

export function scoreReading(answers: Record<string, unknown> | null | undefined, keys: AnswerKeys): ReadingScore {
  const ans = answers ?? {}
  const details: QuestionScore[] = []
  const invalid: string[] = []
  let raw = 0
  let max = 0
  let correctCount = 0
  let total = 0

  for (const qid of Object.keys(keys ?? {})) {
    const parsed = AnswerKeyEntrySchema.safeParse((keys as Record<string, unknown>)[qid])
    if (!parsed.success) {
      // Key sai cấu trúc/type → KHÔNG chấm (tránh chấm sai âm thầm); surface qua invalid_question_ids.
      invalid.push(qid)
      continue
    }
    const key = parsed.data
    const pts = key.points ?? 1 // đã đảm bảo int dương qua schema
    max += pts
    total++
    const correct = isAnswerCorrect(ans[qid], key)
    if (correct) {
      raw += pts
      correctCount++
    }
    details.push({ question_id: qid, correct, points: correct ? pts : 0 })
  }

  return { raw_score: raw, max_score: max, correct_count: correctCount, total, invalid_question_ids: invalid, details }
}
