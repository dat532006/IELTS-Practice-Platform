import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { addTestToProduct } from '@/lib/admin/products'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/products/[id]/tests — gắn đề vào product (mục lục, M11/M04, W13).
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
