import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gradeWriting } from '@/lib/ai/writing-grader'
import { estimateGradeCostUsd } from '@/lib/ai/grade-cost'
import { logEvent } from '@/lib/obs/log-event'
import { pickTaskPassage } from '@/lib/exam/writing-prompts'
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
  | { ok: false; code: 'NOT_FOUND' | 'ATTEMPT_TERMINAL' | 'WORD_COUNT_TOO_LOW' | 'RATE_LIMITED' | 'AI_UNAVAILABLE' | 'GRADING_CONFLICT' }

type AttemptRow = { id: string; user_id: string; test_id: string; status: string }
type Passage = { id?: string; number?: number; title?: string; content?: string }

type SubmitWritingBody = {
  attempt_id: string
  task1_text: string
  task2_text: string
  ip_hash: string
  ip_daily_limit: number
}

// AI-006: hợp đồng task1/task2 dùng CHUNG với WritingRunner (trước đây copy tay 2 nơi → drift).
//   Lưu ý đổi ngữ nghĩa CÓ CHỦ ĐÍCH: passage id 'task1' tồn tại nhưng content rỗng → trả '' (trước đây
//   rơi sang content của passage Ở VỊ TRÍ 0 — tức đề của TASK KHÁC). Prompt rỗng giờ bị publish guard chặn.
function extractPrompts(passages: unknown): { task1: string; task2: string } {
  const arr = Array.isArray(passages) ? (passages as Passage[]) : []
  return {
    task1: pickTaskPassage(arr, 0, 'task1')?.content ?? '',
    task2: pickTaskPassage(arr, 1, 'task2')?.content ?? '',
  }
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

  // 1b) B-05 (review fix): attempt terminal là BẤT BIẾN (như /api/submit, /answers). Chặn chấm lại
  //   attempt đã submitted/expired → không ghi đè writing_submissions sau nộp, không lệch attempts.band,
  //   không tiêu quota AI vô ích. Retry sau AI_UNAVAILABLE vẫn OK (fail giữ in_progress).
  if (attempt.status !== 'in_progress') return { ok: false, code: 'ATTEMPT_TERMINAL' }

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

  // 3b) EXAM-002 — ATOMIC IDEMPOTENCY CLAIM trước khi reserve/gọi provider. Insert placeholder row
  //   (ai_score=null) vào writing_submissions; unique(attempt_id) đảm bảo CHỈ 1 request thắng claim.
  //   Request thua (unique_violation 23505) → KHÔNG reserve quota, KHÔNG gọi provider → GRADING_CONFLICT.
  //   → dưới concurrency: đúng 1 provider call, 1 quota, 1 row, 1 winner finalize.
  const claimToken = randomUUID()
  const { data: claimData, error: claimErr } = await admin.rpc('claim_writing_grade', {
    p_attempt: attempt.id,
    p_user: userId,
    p_claim_token: claimToken,
  })
  if (claimErr) throw new Error(claimErr.message)
  const claim = claimData as { ok?: boolean; code?: string } | null
  if (claim?.ok !== true) {
    if (claim?.code === 'ATTEMPT_TERMINAL') return { ok: false, code: 'ATTEMPT_TERMINAL' }
    if (claim?.code === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND' }
    return { ok: false, code: 'GRADING_CONFLICT' }
  }
  // Từ đây winner SỞ HỮU claim row; mọi return sớm PHẢI release (xoá placeholder) để cho phép retry.
  const releaseClaim = async () => {
    await admin.from('writing_submissions').delete()
      .eq('attempt_id', attempt.id).eq('user_id', userId)
      .eq('claim_token', claimToken).is('ai_score', null)
  }

  // 4) Rate limit — IP/day atomic first, then per-user free quota. Pro bypasses per-user, not IP anti-abuse.
  let ipReserved = false
  let userReserved = false
  const { data: ipCount, error: ipErr } = await admin.rpc('reserve_ai_grade_ip', {
    p_ip_hash: body.ip_hash,
    p_limit: body.ip_daily_limit,
  })
  if (ipErr) { await releaseClaim(); throw new Error(ipErr.message) }
  ipReserved = typeof ipCount === 'number' && ipCount <= body.ip_daily_limit
  if (!ipReserved) { await releaseClaim(); return { ok: false, code: 'RATE_LIMITED' } }

  const { data: pData, error: pErr } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle()
  if (pErr) { await refundReservations(admin, userId, body.ip_hash, false, ipReserved); await releaseClaim(); throw new Error(pErr.message) }
  const plan = ((pData as { plan?: string } | null)?.plan ?? 'free') as string
  if (plan !== 'pro') {
    const { data: rc, error: rErr } = await admin.rpc('reserve_ai_grade', { p_user_id: userId })
    if (rErr) { await refundReservations(admin, userId, body.ip_hash, false, ipReserved); await releaseClaim(); throw new Error(rErr.message) }
    userReserved = true
    if (typeof rc === 'number' && rc > FREE_DAILY_LIMIT) {
      await refundReservations(admin, userId, body.ip_hash, false, ipReserved)
      await releaseClaim()
      return { ok: false, code: 'RATE_LIMITED' }
    }
  }

  // 5) Grade (Claude/mock). 6) AI fail → refund quota + release claim (cho retry) → AI_UNAVAILABLE.
  const outcome = await gradeWriting({
    task1_prompt: prompts.task1,
    task2_prompt: prompts.task2,
    task1_text: body.task1_text,
    task2_text: body.task2_text,
  })
  if (!outcome.ok) {
    await refundReservations(admin, userId, body.ip_hash, userReserved, ipReserved)
    await releaseClaim()
    return { ok: false, code: 'AI_UNAVAILABLE' }
  }

  // 7) Server compute overall (KHÔNG tin AI overall).
  const overall_band = computeOverallBand(outcome.grade.task1.band, outcome.grade.task2.band)
  const graded_at = new Date().toISOString()
  // AI-016: persist usage + chi phí ước tính THEO TỪNG BÀI (trước đây usage bị vứt sau khi chấm).
  //   est_cost_usd snapshot theo giá lúc chấm; model lạ → null. Mock không có usage.
  const est_cost_usd = estimateGradeCostUsd(outcome.model, outcome.usage)
  const usage = outcome.mock || !outcome.usage ? undefined : {
    provider: outcome.provider ?? null,
    model: outcome.model ?? null,
    input_tokens: outcome.usage.input_tokens ?? null,
    output_tokens: outcome.usage.output_tokens ?? null,
    est_cost_usd,
  }
  if (usage) {
    // Quan sát realtime chi phí trong Vercel logs (OBS_EVENT) — không PII, không nội dung bài.
    logEvent('scoring.usage', 'info', {
      provider: usage.provider, model: usage.model,
      in: usage.input_tokens, out: usage.output_tokens, cost_usd: est_cost_usd,
    })
  }
  const ai_score = {
    task1: outcome.grade.task1,
    task2: outcome.grade.task2,
    overall_band,
    mock: outcome.mock,
    graded_at,
    ...(usage ? { usage } : {}),
  }

  // 8) Persist: UPDATE claim row đã sở hữu (không delete+insert → không đua/duplicate). Finalize attempt.
  const { data: finalizeData, error: wErr } = await admin.rpc('finalize_writing_grade', {
    p_attempt: attempt.id,
    p_user: userId,
    p_claim_token: claimToken,
    p_task1_text: body.task1_text,
    p_task2_text: body.task2_text,
    p_task1_wc: task1_wc,
    p_task2_wc: task2_wc,
    p_ai_score: ai_score,
    p_graded_at: graded_at,
    p_band: overall_band,
  })
  if (wErr) {
    await refundReservations(admin, userId, body.ip_hash, userReserved, ipReserved)
    await releaseClaim()
    throw new Error(wErr.message)
  }
  const finalized = finalizeData as { ok?: boolean; code?: string } | null
  if (finalized?.ok !== true) {
    await refundReservations(admin, userId, body.ip_hash, userReserved, ipReserved)
    await releaseClaim()
    if (finalized?.code === 'ATTEMPT_TERMINAL') return { ok: false, code: 'ATTEMPT_TERMINAL' }
    if (finalized?.code === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND' }
    return { ok: false, code: 'GRADING_CONFLICT' }
  }
  // Finalize attempt (band = overall cho history/dashboard M09). Conditional: chỉ khi chưa terminal.

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
