import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { getUserDetail } from '@/lib/admin/users'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// GET /api/admin/users/[id] — hồ sơ chi tiết: profile + ban status + VOL sở hữu (kèm via) +
// lịch sử giao dịch + lịch sử làm bài (band/điểm) + Writing AI bands (M11 mở rộng, 2026-07-12).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })
  try {
    const detail = await getUserDetail(createAdminClient(), id)
    if (!detail) return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })
    return ok(detail)
  } catch {
    return fail('INTERNAL', 'Không tải được hồ sơ người dùng', { status: 500 })
  }
}
