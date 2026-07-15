import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTestMeta } from '@/lib/exam/meta'
import { scoreReading, type AnswerKeys } from '@/lib/scoring/score-reading'
import { convertToBand } from '@/lib/scoring/band-convert'
import { sanitizeHighlights } from '@/lib/exam/highlights'
import { sanitizeAnswers } from '@/lib/exam/answers'
import { checkAnswersRev } from '@/lib/exam/answers-rev'
import { logEvent } from '@/lib/obs/log-event'
import type { AttemptDTO, SubmitResult } from '@/types/exam'

// ============================================================
// W5/W6 — Attempt lifecycle (M05). State: in_progress → submitted | expired.
// Timer neo SERVER: started_at (DB default now()) + duration_sec (snapshot tests.duration_sec).
// LUẬT THÉP #12: client time bỏ qua; elapsed = server now − started_at.
// LUẬT THÉP #2/#3: start KHÔNG trả payload (payload chỉ ở GET /api/exam/[id]).
//   W6: submit ĐỌC answer_keys (service_role) CHỈ SAU owner/status/time guard; KHÔNG trả answer_keys ra client.
// Write attempts = service_role (admin) only (RLS deny client write).
// ============================================================

const GRACE_SEC = 5

type AttemptRow = {
  id: string
  user_id: string
  test_id: string
  status: string
  started_at: string
  duration_sec: number | null
  time_spent: number | null
  submitted_at: string | null
  raw_score: number | null
  band: number | string | null
  highlights: unknown
  bookmarked_qs: unknown
  answers: unknown
  answers_rev: number
}

const nowSec = () => Math.floor(Date.now() / 1000)
const isoSec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

function toAttemptDTO(a: AttemptRow): AttemptDTO {
  const duration = a.duration_sec ?? 0
  const elapsed = Math.max(0, nowSec() - isoSec(a.started_at))
  return {
    attempt_id: a.id,
    test_id: a.test_id,
    status: a.status as AttemptDTO['status'],
    started_at: a.started_at,
    duration_sec: duration,
    time_remaining_sec: duration > 0 ? Math.max(0, duration - elapsed) : 0,
    server_now: new Date().toISOString(),
    // W8 (FIX Leader P2): sanitize qua strict anchor schema giống getResult → start DTO KHÔNG bao giờ
    //   echo key lạ (answer_keys/points/match...) kể cả dữ liệu highlights cũ/bẩn trước khi có strict schema.
    highlights: sanitizeHighlights(a.highlights),
    bookmarked_qs: Array.isArray(a.bookmarked_qs) ? (a.bookmarked_qs as string[]) : [],
    // W9: seed draft answers (chống mất bài khi reload). Sanitize → DTO KHÔNG echo shape lạ.
    answers: sanitizeAnswers(a.answers),
    // EXAM-004: seed rev để client gửi lại làm expected_rev (optimistic concurrency chống tab cũ đè).
    answers_rev: a.answers_rev ?? 0,
  }
}

const ATTEMPT_COLS =
  'id, user_id, test_id, status, started_at, duration_sec, time_spent, submitted_at, raw_score, band, highlights, bookmarked_qs, answers, answers_rev'

export type StartResult = { ok: true; attempt: AttemptDTO } | { ok: false; code: 'NOT_FOUND' | 'EXAM_LOCKED' }

// EXAM-003/009 — chụp nội dung đề (passages+questions) lúc START, gắn attempt. Review đọc từ đây (độc lập
//   published visibility + cố định khi đề bị sửa). Best-effort: chụp lỗi KHÔNG chặn vào thi (review fallback
//   nội dung hiện tại + cờ stale). Chỉ gọi cho attempt VỪA TẠO (attempt cũ đã có bản chụp của nó).
async function captureContentSnapshot(admin: SupabaseClient, attemptId: string, testId: string): Promise<void> {
  try {
    const { data: t } = await admin.from('tests').select('passages, questions').eq('id', testId).maybeSingle()
    const row = t as { passages: unknown; questions: unknown } | null
    const { error } = await admin.from('attempt_content_snapshots').insert({
      attempt_id: attemptId,
      test_id: testId,
      passages: row?.passages ?? null,
      questions: row?.questions ?? null,
    })
    if (error) logEvent('exam.snapshot_error', 'warn', { attempt: attemptId, code: error.code ?? null })
  } catch {
    logEvent('exam.snapshot_error', 'warn', { attempt: attemptId, kind: 'exception' })
  }
}

// supabase = RLS client (user): access check + own-rows; admin = service_role: write attempt.
export async function startAttempt(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  testId: string,
  userId: string,
): Promise<StartResult> {
  // Access guard reuse (is_free | test_unlocks). getTestMeta đã chặn uuid sai + published-only.
  const meta = await getTestMeta(supabase, testId, userId)
  if (!meta) return { ok: false, code: 'NOT_FOUND' }
  if (meta.locked) return { ok: false, code: 'EXAM_LOCKED' }

  // Idempotent: reuse attempt in_progress của (user, test) nếu có.
  const { data: existing, error: exErr } = await admin
    .from('attempts')
    .select(ATTEMPT_COLS)
    .eq('user_id', userId)
    .eq('test_id', testId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (exErr) throw new Error(exErr.message)

  let attempt = existing as AttemptRow | null
  if (!attempt) {
    // started_at = now() do DB set (KHÔNG nhận từ client). duration_sec snapshot từ test.
    const { data: created, error: insErr } = await admin
      .from('attempts')
      .insert({ user_id: userId, test_id: testId, duration_sec: meta.duration_sec })
      .select(ATTEMPT_COLS)
      .single()
    if (insErr) {
      // Race: request khác vừa tạo attempt in_progress → đụng partial unique index (23505).
      // Reselect attempt in_progress hiện có (idempotent — không tạo trùng, theo contract).
      if (insErr.code === '23505') {
        const { data: raced, error: reErr } = await admin
          .from('attempts')
          .select(ATTEMPT_COLS)
          .eq('user_id', userId)
          .eq('test_id', testId)
          .eq('status', 'in_progress')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (reErr) throw new Error(reErr.message)
        if (!raced) throw new Error(insErr.message) // bất thường: 23505 nhưng không thấy in_progress
        attempt = raced as AttemptRow
      } else {
        throw new Error(insErr.message)
      }
    } else {
      attempt = created as AttemptRow
      // EXAM-003/009: attempt VỪA TẠO → chụp nội dung đề (best-effort). Attempt reuse/raced đã có bản chụp riêng.
      await captureContentSnapshot(admin, attempt.id, testId)
    }
  }

  return { ok: true, attempt: toAttemptDTO(attempt) }
}

export type SubmitWrap =
  | { error: 'NOT_FOUND' }
  | { error: 'ANSWERS_STALE' } // EXAM-004: expected_rev lệch → submit từ tab CŨ, KHÔNG ghi đè/chấm
  | { error: null; result: SubmitResult; warnings: string[] }

const toBandNum = (b: number | string | null): number | null => (b == null ? null : Number(b))

function terminalResult(a: AttemptRow): SubmitResult {
  return {
    attempt_id: a.id,
    status: a.status as 'submitted' | 'expired',
    time_spent: a.time_spent ?? 0,
    submitted_at: a.submitted_at ?? new Date().toISOString(),
    scored: a.raw_score != null, // đã chấm trước đó (W6) hay chưa (attempt W5 cũ)
    raw_score: a.raw_score ?? null,
    band: toBandNum(a.band),
    max_score: null, // không re-đọc answer_keys ở nhánh terminal (idempotent)
  }
}

type ScoreOutcome = {
  scored: boolean
  raw_score: number | null
  band: number | null
  max_score: number | null
  warnings: string[]
}

// 🔐 W6: đọc answer_keys (service_role) → validate → chấm Reading → band. CHỈ gọi cho request THẮNG claim.
async function scoreSubmission(admin: SupabaseClient, testId: string, answers: Record<string, unknown>): Promise<ScoreOutcome> {
  const warnings: string[] = []

  const { data: akData, error: akErr } = await admin.from('answer_keys').select('keys').eq('test_id', testId).maybeSingle()
  if (akErr) throw new Error(akErr.message)

  const keys = (akData?.keys ?? null) as AnswerKeys | null
  if (!keys || Object.keys(keys).length === 0) {
    warnings.push('ANSWER_KEYS_MISSING')
    return { scored: false, raw_score: null, band: null, max_score: null, warnings }
  }

  const sc = scoreReading(answers, keys) // validate per-entry bên trong (P2a)
  if (sc.invalid_question_ids.length > 0) warnings.push('ANSWER_KEYS_INVALID') // key sai cấu trúc/type bị loại — surface, không chấm âm thầm
  if (sc.total === 0) {
    // không có key hợp lệ nào → không chấm được (không ghi raw/band sai).
    return { scored: false, raw_score: null, band: null, max_score: null, warnings }
  }

  // test type để chọn bảng score_bands đúng (reading ở W6; listening W7).
  const { data: tRow, error: tErr } = await admin.from('tests').select('type').eq('id', testId).maybeSingle()
  if (tErr) throw new Error(tErr.message)
  const testType = ((tRow as { type?: string } | null)?.type ?? 'reading') as string

  const { band, warning } = await convertToBand(admin, sc.raw_score, testType)
  if (warning) warnings.push(warning)

  return { scored: true, raw_score: sc.raw_score, band, max_score: sc.max_score, warnings }
}

// admin = service_role (write). Owner + status + time guard → đọc answer_keys + chấm → GHI TẤT CẢ TRONG 1
//   CONDITIONAL UPDATE (ATOMIC: status + answers + time_spent + submitted_at + raw_score + band cùng lúc).
// FIX (Leader review P1): KHÔNG tách claim/scoring 2 bước (tránh kẹt "terminal-but-unscored" nếu chấm/ghi lỗi
//   sau khi đã finalize). Đọc keys + chấm TRƯỚC; nếu đọc keys/chấm/update lỗi → attempt VẪN `in_progress`
//   (chưa ghi gì) → submit lại chấm lại (retry-safe, không bao giờ kẹt raw_score=null vĩnh viễn).
// P2c: terminal/loser KHÔNG gán warning của request thua cho result đã lưu (warnings:[]). Loser CÓ đọc
//   answer_keys (service_role, KHÔNG bao giờ lộ client) — chấp nhận, đổi lấy tính ATOMIC (Leader option a).
export async function submitAttempt(
  admin: SupabaseClient,
  attemptId: string,
  userId: string,
  answers: Record<string, unknown>,
  expectedRev?: number,
): Promise<SubmitWrap> {
  const { data, error } = await admin.from('attempts').select(ATTEMPT_COLS).eq('id', attemptId).maybeSingle()
  if (error) throw new Error(error.message)
  const a = data as AttemptRow | null
  // Không lộ tồn tại attempt người khác.
  if (!a || a.user_id !== userId) return { error: 'NOT_FOUND' }

  // Idempotent: đã terminal → trả trạng thái đã lưu (auto/double submit an toàn). KHÔNG đọc answer_keys; warnings rỗng.
  if (a.status !== 'in_progress') return { error: null, result: terminalResult(a), warnings: [] }

  // EXAM-004: expected_rev lệch answers_rev → submit từ tab CŨ (đã có autosave mới hơn ở tab khác) → TỪ CHỐI,
  //   KHÔNG chấm/ghi đè (client tải lại lấy đáp án mới rồi nộp lại). Bảo toàn đáp án tab mới.
  if (!checkAnswersRev(a.answers_rev, expectedRev).ok) return { error: 'ANSWERS_STALE' }

  const duration = a.duration_sec ?? 0
  const elapsed = Math.max(0, nowSec() - isoSec(a.started_at))
  const expired = duration > 0 && elapsed > duration + GRACE_SEC
  const status: 'submitted' | 'expired' = expired ? 'expired' : 'submitted'
  const time_spent = duration > 0 ? Math.min(elapsed, duration) : elapsed
  const submitted_at = new Date().toISOString()

  // 🔐 Đọc answer_keys + chấm TRƯỚC (cả submitted lẫn expired). Lỗi ở đây → throw → attempt còn in_progress → retry.
  const scored = await scoreSubmission(admin, a.test_id, answers)

  // GHI ATOMIC: 1 conditional update (status + score + bump rev cùng lúc). `status='in_progress'` → chỉ 1 winner
  //   (chống double-submit/race). `answers_rev`=rev đã đọc → EXAM-004: autosave chen giữa read↔submit làm rev
  //   đổi thì update 0 row (không đè đáp án mới hơn). Cả 2 guard atomic dưới row-lock.
  const { data: upd, error: uErr } = await admin
    .from('attempts')
    .update({ status, answers, time_spent, submitted_at, raw_score: scored.raw_score, band: scored.band, answers_rev: a.answers_rev + 1 })
    .eq('id', attemptId)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .eq('answers_rev', a.answers_rev)
    .select('id')
    .maybeSingle()
  if (uErr) throw new Error(uErr.message)

  if (!upd) {
    // 0 row → re-select phân biệt: còn in_progress = autosave khác vừa bump rev (EXAM-004 stale) → TỪ CHỐI;
    //   đã terminal = thua race submit khác → trả hiện trạng ĐÃ LƯU của winner (idempotent), warnings rỗng.
    const { data: re } = await admin.from('attempts').select(ATTEMPT_COLS).eq('id', attemptId).maybeSingle()
    const r = re as AttemptRow | null
    if (r && r.status === 'in_progress') return { error: 'ANSWERS_STALE' }
    return {
      error: null,
      warnings: [],
      result: r ? terminalResult(r) : { attempt_id: attemptId, status, time_spent, submitted_at, scored: scored.scored, raw_score: scored.raw_score, band: scored.band, max_score: scored.max_score },
    }
  }

  return {
    error: null,
    warnings: scored.warnings,
    result: {
      attempt_id: attemptId,
      status,
      time_spent,
      submitted_at,
      scored: scored.scored,
      raw_score: scored.raw_score,
      band: scored.band,
      max_score: scored.max_score,
    },
  }
}
