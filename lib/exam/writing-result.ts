import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WritingGradeResult, WritingTaskGrade } from '@/types/exam'

// ============================================================
// W10 (F-B) — Writing result read (M07). api_contract §4 GET /api/writing-result/[id].
// CHỈ owner (writing_submissions.user_id = userId). Trả DTO từ ai_score đã lưu (server-computed overall).
//   KHÔNG trả dữ liệu user khác; KHÔNG raw provider/system prompt (ai_score chỉ chứa grade đã validate).
// ============================================================

type Row = {
  attempt_id: string
  user_id: string
  task1_wc: number | null
  task2_wc: number | null
  ai_score: unknown
  graded_at: string | null
}
type StoredScore = {
  task1?: WritingTaskGrade
  task2?: WritingTaskGrade
  overall_band?: number
  mock?: boolean
  graded_at?: string
}

export type WritingResultOutcome = { ok: true; result: WritingGradeResult } | { ok: false; code: 'NOT_FOUND' }

// admin = service_role. id = attempt_id (đồng nhất với /result/[attemptId]).
export async function getWritingResult(
  admin: SupabaseClient,
  attemptId: string,
  userId: string,
): Promise<WritingResultOutcome> {
  const { data, error } = await admin
    .from('writing_submissions')
    .select('attempt_id, user_id, task1_wc, task2_wc, ai_score, graded_at')
    .eq('attempt_id', attemptId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as Row | null
  // Không lộ tồn tại submission người khác.
  if (!row || row.user_id !== userId) return { ok: false, code: 'NOT_FOUND' }

  const ai = (row.ai_score ?? {}) as StoredScore
  if (!ai.task1 || !ai.task2 || typeof ai.overall_band !== 'number') return { ok: false, code: 'NOT_FOUND' }

  const result: WritingGradeResult = {
    attempt_id: row.attempt_id,
    task1: ai.task1,
    task2: ai.task2,
    overall_band: ai.overall_band,
    task1_wc: row.task1_wc ?? 0,
    task2_wc: row.task2_wc ?? 0,
    graded_at: row.graded_at ?? ai.graded_at ?? '',
    mock: !!ai.mock,
  }
  return { ok: true, result }
}
