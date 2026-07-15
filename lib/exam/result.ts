import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreReading, type AnswerKeys } from '@/lib/scoring/score-reading'
import { buildReviewItems } from '@/lib/exam/review'
import { sanitizeHighlights } from '@/lib/exam/highlights'
import { pickReviewContent } from '@/lib/exam/review-content'
import { sanitizePassages } from '@/lib/sanitize/passage-html'
import { getSignedAudioUrl } from '@/lib/exam/access'
import type { ResultDTO, ExamSkill } from '@/types/exam'

// ============================================================
// W8 — Result review (M05). CHỈ owner + status submitted|expired (LUẬT THÉP #4).
// Đọc answer_keys (service_role) CHỈ SAU guard; review item sanitize (KHÔNG raw answer_keys — #2).
// KHÔNG chấm lại điểm: raw_score/band lấy từ attempt đã ghi ở submit (W6).
// ============================================================

type AttemptRow = {
  id: string
  user_id: string
  test_id: string
  status: string
  submitted_at: string | null
  time_spent: number | null
  raw_score: number | null
  band: number | string | null
  answers: Record<string, unknown> | null
  highlights: unknown
  bookmarked_qs: unknown
}

const RESULT_COLS =
  'id, user_id, test_id, status, submitted_at, time_spent, raw_score, band, answers, highlights, bookmarked_qs'

export type ResultOutcome =
  | { ok: true; result: ResultDTO }
  | { ok: false; code: 'NOT_FOUND' | 'RESULT_NOT_READY' }

const toNum = (b: number | string | null): number | null => (b == null ? null : Number(b))
const toIdArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

// admin = service_role. Guard owner + terminal status TRƯỚC khi đọc answer_keys.
export async function getResult(admin: SupabaseClient, attemptId: string, userId: string): Promise<ResultOutcome> {
  const { data, error } = await admin.from('attempts').select(RESULT_COLS).eq('id', attemptId).maybeSingle()
  if (error) throw new Error(error.message)
  const a = data as AttemptRow | null
  // Không lộ tồn tại attempt người khác.
  if (!a || a.user_id !== userId) return { ok: false, code: 'NOT_FOUND' }
  // Chưa terminal → KHÔNG trả review/đáp án.
  if (a.status !== 'submitted' && a.status !== 'expired') return { ok: false, code: 'RESULT_NOT_READY' }

  // ---- CHỈ TỪ ĐÂY: owner + terminal đã xác nhận → đọc answer_keys + nội dung (service_role) ----
  //   EXAM-003/009: ưu tiên bản chụp lúc START (attempt_content_snapshots). Vẫn đọc tests hiện tại để lấy
  //   title/type/audio_key + fallback nội dung cho attempt cũ (không bản chụp).
  const [{ data: akData, error: akErr }, { data: tData, error: tErr }, { data: snapData, error: snapErr }] =
    await Promise.all([
      admin.from('answer_keys').select('keys').eq('test_id', a.test_id).maybeSingle(),
      admin.from('tests').select('title, type, questions, passages, audio_key').eq('id', a.test_id).maybeSingle(),
      admin.from('attempt_content_snapshots').select('passages, questions, answer_keys, test_title, test_type, audio_key').eq('attempt_id', a.id).maybeSingle(),
    ])
  if (akErr) throw new Error(akErr.message)
  if (tErr) throw new Error(tErr.message)
  if (snapErr) throw new Error(snapErr.message)

  const testRow = (tData ?? {}) as { title?: string; type?: string; questions?: unknown; passages?: unknown; audio_key?: string | null }
  const snap = (snapData ?? null) as {
    passages: unknown; questions: unknown; answer_keys?: AnswerKeys | null
    test_title?: string | null; test_type?: string | null; audio_key?: string | null
  } | null
  // Older snapshots predate scoring metadata. They remain readable but are explicitly stale.
  const completeSnapshot = snap?.answer_keys != null
  const keys = (completeSnapshot ? snap.answer_keys : akData?.keys ?? {}) as AnswerKeys
  const title = completeSnapshot ? snap.test_title ?? '' : testRow.title ?? ''
  const skill = (completeSnapshot ? snap.test_type ?? 'reading' : testRow.type ?? 'reading') as ExamSkill
  const audioKey = completeSnapshot ? snap.audio_key ?? null : testRow.audio_key ?? null

  // EXAM-003/009: nội dung review = bản chụp nếu có, else fallback hiện tại + cờ stale. Review items build từ
  //   questions của NGUỒN NÀY (đề bị sửa sau khi thi không làm trôi đúng/sai/số câu).
  const content = pickReviewContent(snap, { passages: testRow.passages, questions: testRow.questions })

  const review = buildReviewItems(a.answers, keys as Record<string, unknown>, content.questions)
  // max_score nhất quán với scoring W6 (Σ points key hợp lệ). KHÔNG lộ map từng câu.
  const { max_score } = scoreReading(a.answers ?? {}, keys)

  // Audio Listening ký lại từ audio_key hiện tại (audio_key server-only, KHÔNG ra client). Thiếu R2/key → null.
  const { url: audio_url } = getSignedAudioUrl({ type: skill, audio_key: audioKey })

  const result: ResultDTO = {
    attempt_id: a.id,
    test: { id: a.test_id, title, skill },
    status: a.status as 'submitted' | 'expired',
    submitted_at: a.submitted_at,
    time_spent: a.time_spent,
    raw_score: a.raw_score,
    max_score: review.length > 0 ? max_score : null,
    band: toNum(a.band),
    review,
    // Defense-in-depth (P1): sanitize về đúng anchor shape → result KHÔNG bao giờ echo key lạ
    // (answer_keys/points/match...) kể cả nếu dữ liệu highlights cũ/bất thường.
    highlights: sanitizeHighlights(a.highlights),
    bookmarked_qs: toIdArray(a.bookmarked_qs),
    // EXAM-003/009: nội dung render review từ bản chụp (sanitize passage lần nữa trên đường ra client như /api/exam).
    content: { passages: sanitizePassages(content.passages), questions: content.questions, audio_url },
    content_stale: content.stale || !completeSnapshot,
  }
  return { ok: true, result }
}
