import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { getProductDetail } from '@/lib/admin/products'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// GET /api/admin/products/[id] — admin-only detail + mục lục test METADATA-ONLY (M11/M04, W13).
// KHÔNG trả passages/questions/answer_keys/audio_key (no-leak). requireAdmin TRƯỚC.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })

  const res = await getProductDetail(createAdminClient(), id)
  if (!res.ok) return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })
  return ok({ product: res.product, tests: res.tests })
}
