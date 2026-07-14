import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/payments/exceptions/[id]/resolve — PAY-004: đóng case exactly-once (open→resolved/ignored),
//   ghi actor (admin) + note. KHÔNG credit ở đây (giải quyết tiền = admin coin adjust có ledger riêng, quyết
//   định Owner). resolve lần 2 → 409 (RPC chỉ đổi khi đang 'open').
const Body = z.object({
  status: z.enum(['resolved', 'ignored']),
  note: z.string().max(2000).optional().default(''),
}).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy case', { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('resolve_payment_exception', {
    p_id: id, p_admin: g.userId, p_status: parsed.data.status, p_note: parsed.data.note,
  })
  if (error) return fail('INTERNAL', 'Không cập nhật được case', { status: 500 })
  if ((data as { ok?: boolean } | null)?.ok !== true) {
    return fail('VALIDATION_ERROR', 'Case đã được xử lý hoặc không còn ở trạng thái mở', { status: 409 })
  }
  return ok({ id, status: parsed.data.status })
}
