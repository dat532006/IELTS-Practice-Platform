import 'server-only'
import { AnswerKeyEntrySchema, isAnswerCorrect } from '@/lib/scoring/score-reading'
import { normalizeEvidence } from '@/lib/exam/evidence-locate'
import type { ReviewItem } from '@/types/exam'

// ============================================================
// W8 — Sanitized result review builder (M05/M06). PURE, server-only.
// LUẬT THÉP #2/#4: KHÔNG trả raw answer_keys (points/match/blob). Chỉ build review item sạch
//   (id/number/type/user_answer/correct_answers/is_correct) cho owner + attempt terminal.
// Source of truth = answer_keys.keys (lặp theo KEY, giống scoreReading) → user không nhồi qid lạ.
// Reuse isAnswerCorrect (W6) — KHÔNG chấm lại điểm, chỉ tính đúng/sai để hiển thị.
// ============================================================

type RawQuestion = { id?: string; number?: number; type?: string }

function answerForDisplay(v: unknown): string | string[] | null {
  if (v == null) return null
  if (Array.isArray(v)) return v.map((x) => (x == null ? '' : String(x)))
  return String(v)
}

export function buildReviewItems(
  answers: Record<string, unknown> | null | undefined,
  keysRaw: Record<string, unknown> | null | undefined,
  questions: unknown,
): ReviewItem[] {
  const ans = answers ?? {}
  const keys = keysRaw ?? {}
  // map qid → {number,type} từ questions payload (metadata câu; KHÔNG chứa đáp án).
  const qMap = new Map<string, RawQuestion>()
  if (Array.isArray(questions)) {
    for (const q of questions as RawQuestion[]) {
      if (q && typeof q.id === 'string') qMap.set(q.id, q)
    }
  }

  const items: ReviewItem[] = []
  for (const qid of Object.keys(keys)) {
    const parsed = AnswerKeyEntrySchema.safeParse((keys as Record<string, unknown>)[qid])
    if (!parsed.success) continue // key sai cấu trúc → bỏ qua (không crash, không lộ raw)
    const entry = parsed.data
    const q = qMap.get(qid)
    items.push({
      question_id: qid,
      number: q?.number,
      type: entry.type ?? q?.type,
      user_answer: answerForDisplay(ans[qid]),
      correct_answers: entry.answers, // string[] hợp lệ; KHÔNG kèm points/match
      is_correct: isAnswerCorrect(ans[qid], entry),
      // P3: giải thích chỉ đính khi có (đã qua owner+terminal guard ở getResult, giống correct_answers).
      ...(entry.explanation ? { explanation: entry.explanation } : {}),
      // EXAM-006: chuẩn hóa string(legacy)|object → descriptor {quote, occurrence?, context_*}; rỗng → bỏ.
      ...((() => { const ev = normalizeEvidence(entry.evidence); return ev ? { evidence: ev } : {} })()),
    })
  }
  // sắp theo number nếu có (ổn định cho UI), giữ nguyên thứ tự key khi thiếu number.
  items.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  return items
}
