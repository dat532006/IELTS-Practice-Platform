import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/users/[id]/ban — khóa/mở khóa tài khoản qua Supabase Auth ban (2026-07-12).
// banned=true → ban_duration dài (100 năm); banned=false → 'none'. User bị ban KHÔNG đăng nhập /
// refresh phiên được; phiên đang sống còn hiệu lực tới khi access token hết hạn (~1h) — giới hạn
// đã nêu rõ với Owner. Không cho admin tự khóa chính mình (chống tự lock-out).
const Body = z.object({ banned: z.boolean() }).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Cần field banned (boolean)', { status: 400 })

  if (parsed.data.banned && id === g.userId)
    return fail('VALIDATION_ERROR', 'Không thể tự khóa tài khoản admin đang thao tác', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: parsed.data.banned ? '876000h' : 'none',
  })
  if (error) {
    const notFound = /not.*found|does not exist/i.test(error.message)
    if (notFound) return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })
    return fail('INTERNAL', 'Không cập nhật được trạng thái khóa', { status: 500 })
  }
  return ok({ user_id: id, banned: parsed.data.banned })
}
