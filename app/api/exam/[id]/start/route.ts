import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/auth/guards'
import { startAttempt } from '@/lib/exam/attempt'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/exam/[id]/start — tạo/resume attempt (M05). KHÔNG trả payload (payload = GET /api/exam/[id]).
// Access guard reuse (is_free | test_unlocks); started_at/duration_sec neo server.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề thi', { status: 404 })

    const supabase = await createClient()
    const user = await getAuthedUser(supabase)
    // Attempt gắn với user (ghi lịch sử/kết quả) → bắt buộc đăng nhập (và không bị ban).
    if (!user) return fail('UNAUTHORIZED', 'Cần đăng nhập để bắt đầu làm bài', { status: 401 })

    const admin = createAdminClient()
    const res = await startAttempt(supabase, admin, id, user.id)
    if (!res.ok) {
      if (res.code === 'EXAM_LOCKED')
        return fail('EXAM_LOCKED', 'Đề thi này cần được mở khóa trước khi làm bài', { status: 403 })
      return fail('NOT_FOUND', 'Không tìm thấy đề thi', { status: 404 })
    }
    return ok(res.attempt)
  } catch {
    return fail('INTERNAL', 'Không bắt đầu được lượt làm bài', { status: 500 })
  }
}
