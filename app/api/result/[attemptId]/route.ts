import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResult } from '@/lib/exam/result'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// GET /api/result/[attemptId] — RESULT REVIEW (M05). LUẬT THÉP #4: chỉ owner + submitted|expired.
//   LUẬT THÉP #2: review là DTO sanitize — KHÔNG raw answer_keys/keys/points/match.
//   Đọc answer_keys (service_role) CHỈ SAU owner + terminal guard.
export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId } = await params
    if (!isUuid(attemptId)) return fail('NOT_FOUND', 'Không tìm thấy kết quả', { status: 404 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

    const admin = createAdminClient()
    const outcome = await getResult(admin, attemptId, user.id)
    if (!outcome.ok) {
      if (outcome.code === 'RESULT_NOT_READY')
        return fail('RESULT_NOT_READY', 'Bài thi chưa nộp nên chưa có kết quả', { status: 403 })
      return fail('NOT_FOUND', 'Không tìm thấy kết quả', { status: 404 })
    }
    return ok(outcome.result)
  } catch {
    return fail('INTERNAL', 'Không tải được kết quả', { status: 500 })
  }
}
