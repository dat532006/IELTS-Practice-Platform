import { z } from 'zod'

// ============================================================
// W9 — Draft answers (autosave). M05.
// LUẬT THÉP #2/#12: đây là answer THÔ của owner (chống mất bài khi reload), KHÔNG phải scoring.
//   KHÔNG bao giờ chứa/đụng answer_keys/raw_score/band/status. Shape khớp client serialize:
//   answers[question.id] = string (single) | string[] (mcq_multi). Strict size/shape guard.
// ============================================================

// FB-07 (2026-07-18): nháp Writing (task1/task2 nguyên văn) đi CÙNG kênh autosave này → cap chuỗi đơn
//   nâng 2000 → 20000 (Task 2 ~400 từ ≈ 2.5KB; 20KB đủ cho bài rất dài). Tổng vẫn bị route chặn 64KB
//   (MAX_ANSWERS_BYTES). Mảng (mcq_multi — chữ cái đáp án) giữ cap ngắn.
const AnswerValueSchema = z.union([
  z.string().max(20_000),
  z.array(z.string().max(2000)).max(50),
])

// key = question.id (string ngắn). Reject value lạ (object/number/null) → bỏ entry, không throw cả map.
export const AnswersSchema = z.record(z.string().min(1).max(64), AnswerValueSchema)
export type AnswersMap = z.infer<typeof AnswersSchema>

// Defense-in-depth khi ĐỌC (dữ liệu cũ/bẩn) → DTO start KHÔNG echo shape lạ. Bỏ entry không hợp lệ.
export function sanitizeAnswers(value: unknown): AnswersMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: AnswersMap = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const pk = z.string().min(1).max(64).safeParse(k)
    const pv = AnswerValueSchema.safeParse(v)
    if (pk.success && pv.success) out[pk.data] = pv.data
  }
  return out
}
