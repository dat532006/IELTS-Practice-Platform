import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { addTestToProduct } from '@/lib/admin/products'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST/DELETE /api/admin/products/[id]/tests — gắn/gỡ đề khỏi product (mục lục, M11/M04, W13 + 2026-07-12).
// Upsert collection_tests(product_id,test_id,position) — idempotent. requireAdmin TRƯỚC.
// Giữ policy collection_tests_select_published: test draft trong bundle published KHÔNG lộ client.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await addTestToProduct(createAdminClient(), id, raw)
  if (!res.ok) {
    if (res.code === 'VALIDATION_ERROR') return fail('VALIDATION_ERROR', res.detail ?? 'Dữ liệu không hợp lệ', { status: 400 })
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', res.detail ?? 'Không tìm thấy product', { status: 404 })
    return fail('INTERNAL', 'Không gắn được đề vào product', { status: 500 })
  }
  return ok({ product_id: res.product_id, test_id: res.test_id, position: res.position }, { status: 201 })
}

// DELETE — gỡ đề khỏi mục lục VOL. Idempotent (gỡ đề không có trong VOL → removed:false).
// ⚠️ Owner quyết 2026-07-12: KHÔNG thu hồi test_unlocks — người đã mua VOL trước đó GIỮ quyền làm đề.
const UnbindBody = z.object({ test_id: z.string().uuid() }).strict()
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = UnbindBody.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Cần test_id (uuid)', { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('collection_tests')
    .delete()
    .eq('product_id', id)
    .eq('test_id', parsed.data.test_id)
    .select('test_id')
  if (error) return fail('INTERNAL', 'Không gỡ được đề khỏi product', { status: 500 })
  return ok({ product_id: id, test_id: parsed.data.test_id, removed: (data?.length ?? 0) > 0 })
}
