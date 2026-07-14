import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/auth/guards'
import { getWritingResult } from '@/lib/exam/writing-result'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// GET /api/writing-result/[id] — Writing result review (M07, api_contract §4). id = attempt_id.
// LUẬT THÉP: auth + owner-only; trả ai_score đã validate (overall server-computed); KHÔNG dữ liệu user khác.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy kết quả', { status: 404 })

    const supabase = await createClient()
    const user = await getAuthedUser(supabase)
    if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

    const admin = createAdminClient()
    const outcome = await getWritingResult(admin, id, user.id)
    if (!outcome.ok) return fail('NOT_FOUND', 'Không tìm thấy kết quả', { status: 404 })
    return ok(outcome.result)
  } catch {
    return fail('INTERNAL', 'Không tải được kết quả', { status: 500 })
  }
}
