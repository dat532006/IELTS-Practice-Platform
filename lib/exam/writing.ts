import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gradeWriting } from '@/lib/ai/writing-grader'
import { computeOverallBand } from '@/lib/scoring/writing-band'
import type { WritingGradeResult } from '@/types/exam'

// ============================================================
// W10/W11 — Writing grading orchestration (M07). SERVER-ONLY.
// Boundary order: owner guard → word-count → writing type guard → IP/user rate reserve → grade → server overall → persist.
//   Write writing_submissions = service_role (RLS deny client write). overall_band server-compute (KHÔNG tin AI).
//   W11 adds hashed IP/day limit in addition to per-user ai_grade_usage.
// ============================================================

const T1_MIN_WORDS = 150
const T2_MIN_WORDS = 250
const FREE_DAILY_LIMIT = 1

export const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length

export type WritingOutcome =
  | { ok: true; result: WritingGradeResult; warnings: string[] }
  | { ok: false; code: 'NOT_FOUND' | 'WORD_COUNT_TOO_LOW' | 'RATE_LIMITED' | 'AI_UNAVAILABLE' }

type AttemptRow = { id: string; user_id: string; test_id: string; status: string }
type Passage = { id?: string; number?: number; title?: string; content?: string }

type SubmitWritingBody = {
  attempt_id: string
  task1_text: string
  task2_text: string
  ip_hash: string
  ip_daily_limit: number
}

function extractPrompts(passages: unknown): { task1: string; task2: string } {
  const arr = Array.isArray(passages) ? (passages as Passage[]) : []
  const pick = (i: number, id: string) =>
    arr.find((p) => p?.id === id)?.content ?? arr[i]?.content ?? ''
  return { task1: pick(0, 'task1'), task2: pick(1, 'task2') }
}

async function refundReservations(admin: SupabaseClient, userId: string, ipHash: string, userReserved: boolean, ipReserved: boolean) {
  if (userReserved) await admin.rpc('refund_ai_grade', { p_user_id: userId })
  if (ipReserved) await admin.rpc('refund_ai_grade_ip', { p_ip_hash: ipHash })
}

export async function submitWritingGrade(
  admin: SupabaseClient,
  userId: string,
  body: SubmitWritingBody,
): Promise<WritingOutcome> {
  // 1) Owner guard — KHÔNG lộ tồn tại attempt người khác.
  const { data: aData, error: aErr } = await admin
    .from('attempts')
    .select('id, user_id, test_id, status')
    .eq('id', body.attempt_id)
    .maybeSingle()
  if (aErr) throw new Error(aErr.message)
  const attempt = aData as AttemptRow | null
  if (!attempt || attempt.user_id !== userId) return { ok: false, code: 'NOT_FOUND' }

  // 2) Word count — server đếm lại (KHÔNG tin client).
  const task1_wc = countWords(body.task1_text)
  const task2_wc = countWords(body.task2_text)
  if (task1_wc < T1_MIN_WORDS || task2_wc < T2_MIN_WORDS) return { ok: false, code: 'WORD_COUNT_TOO_LOW' }

  // 3) Lấy đề (prompts) của writing test (service_role).
  const { data: tData, error: tErr } = await admin
    .from('tests')
    .select('type, passages')
    .eq('id', attempt.test_id)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  const testRow = (tData ?? {}) as { type?: string; passages?: unknown }
  // F-C: CHỈ chấm writing test. Chặn finalize sai attempt reading/listening qua route này.
  //   Đặt TRƯỚC reserve → non-writing KHÔNG tốn quota / KHÔNG gọi AI. KHÔNG lộ tồn tại → NOT_FOUND.
  if ((testRow.type ?? '') !== 'writing') return { ok: false, code: 'NOT_FOUND' }
  const prompts = extractPrompts(testRow.passages)

  // 4) Rate limit — IP/day atomic first, then per-user free quota. Pro bypasses per-user, not IP anti-abuse.
  let ipReserved = false
  let userReserved = false
  const { data: ipCount, error: ipErr } = await admin.rpc('reserve_ai_grade_ip', {
    p_ip_hash: body.ip_hash,
    p_limit: body.ip_daily_limit,
  })
  if (ipErr) throw new Error(ipErr.message)
  ipReserved = typeof ipCount === 'number' && ipCount <= body.ip_daily_limit
  if (!ipReserved) return { ok: false, code: 'RATE_LIMITED' }

  const { data: pData, error: pErr } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()
  if (pErr) throw new Error(pErr.message)
  const plan = ((pData as { plan?: string } | null)?.plan ?? 'free') as string
  if (plan !== 'pro') {
    const { data: rc, error: rErr } = await admin.rpc('reserve_ai_grade', { p_user_id: userId })
    if (rErr) throw new Error(rErr.message)
    userReserved = true
    if (typeof rc === 'number' && rc > FREE_DAILY_LIMIT) {
      await refundReservations(admin, userId, body.ip_hash, false, ipReserved)
      return { ok: false, code: 'RATE_LIMITED' }
    }
  }

  // 5) Grade (Claude/mock). 6) AI fail → refund quota → AI_UNAVAILABLE.
  const outcome = await gradeWriting({
    task1_prompt: prompts.task1,
    task2_prompt: prompts.task2,
    task1_text: body.task1_text,
    task2_text: body.task2_text,
  })
  if (!outcome.ok) {
    await refundReservations(admin, userId, body.ip_hash, userReserved, ipReserved)
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }

  // 7) Server compute overall (KHÔNG tin AI overall).
  const overall_band = computeOverallBand(outcome.grade.task1.band, outcome.grade.task2.band)
  const graded_at = new Date().toISOString()
  const ai_score = {
    task1: outcome.grade.task1,
    task2: outcome.grade.task2,
    overall_band,
    mock: outcome.mock,
    graded_at,
  }

  // 8) Persist writing_submissions (service_role; idempotent delete+insert theo attempt). Finalize attempt.
  await admin.from('writing_submissions').delete().eq('attempt_id', attempt.id).eq('user_id', userId)
  const { error: wErr } = await admin.from('writing_submissions').insert({
    attempt_id: attempt.id,
    user_id: userId,
    task1_text: body.task1_text,
    task2_text: body.task2_text,
    task1_wc,
    task2_wc,
    ai_score,
    graded_at,
  })
  if (wErr) throw new Error(wErr.message)
  // Finalize attempt (band = overall cho history/dashboard M09). Conditional: chỉ khi chưa terminal.
  if (attempt.status === 'in_progress') {
    await admin
      .from('attempts')
      .update({ status: 'submitted', submitted_at: graded_at, band: overall_band })
      .eq('id', attempt.id)
      .eq('user_id', userId)
      .eq('status', 'in_progress')
  }

  const result: WritingGradeResult = {
    attempt_id: attempt.id,
    task1: outcome.grade.task1,
    task2: outcome.grade.task2,
    overall_band,
    task1_wc,
    task2_wc,
    graded_at,
    mock: outcome.mock,
  }
  return { ok: true, result, warnings: outcome.mock ? ['AI_GRADER_MOCK'] : [] }
}
