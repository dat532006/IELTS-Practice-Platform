import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { reorderProductTests } from '@/lib/admin/products'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/products/[id]/tests/reorder — ADMIN-010: hoán đổi thứ tự 2 đề ATOMIC (RPC 1 transaction).
//   Thay đường UI cũ gọi 2 request bind tuần tự (fail giữa chừng → swap nửa vời/trùng position, UI báo OK).
//   requireAdmin TRƯỚC service_role.
const Body = z
  .object({ test_id_a: z.string().uuid(), test_id_b: z.string().uuid() })
  .strict()
  .refine((b) => b.test_id_a !== b.test_id_b, { message: 'test_id_a và test_id_b phải khác nhau' })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Cần test_id_a, test_id_b (uuid) khác nhau', { status: 400 })

  const res = await reorderProductTests(createAdminClient(), id, parsed.data.test_id_a, parsed.data.test_id_b)
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Đề không nằm trong sản phẩm này', { status: 404 })
    return fail('INTERNAL', 'Không đổi được thứ tự đề', { status: 500 })
  }
  return ok({ product_id: id, test_id_a: parsed.data.test_id_a, test_id_b: parsed.data.test_id_b })
}
