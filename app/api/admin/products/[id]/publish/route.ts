import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { publishProduct } from '@/lib/admin/products'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/products/[id]/publish — draft→published + refresh product_search (M11/M04, W13).
// refresh matview qua RPC service_role (đã grant). requireAdmin TRƯỚC.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })

  const res = await publishProduct(createAdminClient(), id)
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })
    return fail('INTERNAL', 'Không publish được product', { status: 500 })
  }
  return ok({ product_id: res.product_id, status: res.status })
}
