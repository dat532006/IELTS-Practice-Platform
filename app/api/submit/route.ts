import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/auth/guards'
import { submitAttempt } from '@/lib/exam/attempt'
import { ok, fail } from '@/lib/api/response'

// Body: chỉ attempt_id + answers (theo question.id). ⚠️ KHÔNG nhận field thời gian từ client (server tự tính).
// FIX (Leader review P2b): giới hạn shape/size answers (route server ghi hộ → RLS không chặn được).
//   value chỉ string | string[]; chuỗi/array có giới hạn; tối đa MAX_ANSWERS key; reject object lồng/nested.
const MAX_ANSWERS = 60
const ANSWER_STR_MAX = 500
const ANSWER_ARR_MAX = 20
const ANSWER_KEY_MAX = 64

const AnswerValue = z.union([
  z.string().max(ANSWER_STR_MAX),
  z.array(z.string().max(ANSWER_STR_MAX)).max(ANSWER_ARR_MAX),
])
const SubmitBody = z.object({
  attempt_id: z.string().uuid(),
  answers: z
    .record(z.string().max(ANSWER_KEY_MAX), AnswerValue)
    .refine((a) => Object.keys(a).length <= MAX_ANSWERS, { message: 'too many answers' })
    .optional()
    .default({}),
  // EXAM-004: rev client đã thấy (từ /start + autosave) — optimistic concurrency chống tab cũ đè khi nộp.
  expected_rev: z.number().int().nonnegative().optional(),
})

// POST /api/submit — submit/expire + SCORING (M05/M06). Owner + status + time guard, server-side.
// W6: SAU guard → đọc answer_keys (service_role) → chấm Reading → ghi raw_score/band. KHÔNG trả answer_keys/correct.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getAuthedUser(supabase)
    if (!user) return fail('UNAUTHORIZED', 'Cần đăng nhập để nộp bài', { status: 401 })

    const json = await request.json().catch(() => null)
    const parsed = SubmitBody.safeParse(json)
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu nộp bài không hợp lệ', { status: 400 })

    const admin = createAdminClient()
    const res = await submitAttempt(admin, parsed.data.attempt_id, user.id, parsed.data.answers, parsed.data.expected_rev)
    if (res.error === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy lượt làm bài', { status: 404 })
    // EXAM-004: submit từ tab CŨ (rev lệch) → 409, KHÔNG chấm/ghi đè; client tải lại lấy bản mới rồi nộp lại.
    if (res.error === 'ANSWERS_STALE') return fail('ANSWERS_STALE', 'Bài đã được cập nhật ở nơi khác, hãy tải lại trước khi nộp', { status: 409 })
    return ok(res.result, { warnings: res.warnings })
  } catch {
    return fail('INTERNAL', 'Không nộp được bài', { status: 500 })
  }
}
