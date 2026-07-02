import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { submitWritingGrade } from '@/lib/exam/writing'
import { ok, fail } from '@/lib/api/response'
import { extractTrustedClientIp, getAiGradeIpDailyLimit, hashAiGradeIp } from '@/lib/rate-limit/ai-ip'

// POST /api/grade-writing — Writing AI grading (M07, W10/W11). Server-only Claude + rate limit + persist.
// LUẬT THÉP: auth required; owner guard; rate-limit TRƯỚC Claude; Zod-validate AI output (trong grader);
//   overall_band SERVER-compute; KHÔNG lộ system prompt / API key / raw provider response / IP hash.
const MAX_TEXT = 20000 // ~ đủ cho 1 bài essay; chống payload lạm dụng
const BodySchema = z.object({
  attempt_id: z.string().uuid(),
  task1_text: z.string().min(1).max(MAX_TEXT),
  task2_text: z.string().min(1).max(MAX_TEXT),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return fail('UNAUTHORIZED', 'Cần đăng nhập để chấm bài Writing', { status: 401 })

    const raw = await request.json().catch(() => null)
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu bài Writing không hợp lệ', { status: 400 })

    const clientIp = extractTrustedClientIp(request.headers)
    const admin = createAdminClient()
    const res = await submitWritingGrade(admin, user.id, {
      ...parsed.data,
      ip_hash: hashAiGradeIp(clientIp),
      ip_daily_limit: getAiGradeIpDailyLimit(),
    })
    if (!res.ok) {
      switch (res.code) {
        case 'NOT_FOUND':
          return fail('NOT_FOUND', 'Không tìm thấy lượt làm bài', { status: 404 })
        case 'ATTEMPT_TERMINAL':
          return fail('ATTEMPT_TERMINAL', 'Bài đã nộp và chấm xong, không thể chấm lại', { status: 409 })
        case 'WORD_COUNT_TOO_LOW':
          return fail('WORD_COUNT_TOO_LOW', 'Task 1 cần ≥150 từ và Task 2 cần ≥250 từ', { status: 400 })
        case 'RATE_LIMITED':
          return fail('RATE_LIMITED', 'Bạn đã dùng hết lượt chấm AI hiện tại, vui lòng thử lại sau', { status: 429 })
        case 'AI_UNAVAILABLE':
          return fail('AI_UNAVAILABLE', 'Hệ thống chấm AI tạm thời không khả dụng, vui lòng thử lại', { status: 502 })
      }
    }
    return ok(res.result, { warnings: res.warnings })
  } catch {
    return fail('INTERNAL', 'Không chấm được bài Writing', { status: 500 })
  }
}
