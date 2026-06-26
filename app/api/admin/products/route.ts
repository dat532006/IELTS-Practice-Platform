import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { createProduct, updateProduct, listProducts, type AdminProductOutcome } from '@/lib/admin/products'
import { ok, fail } from '@/lib/api/response'

// POST/PATCH/GET /api/admin/products — Admin product/bundle CRUD + pricing (M11/M04, W13).
// LUẬT THÉP #4: price_coins server-authoritative; requireAdmin server-side TRƯỚC mọi mutation.
function mapFail(res: Extract<AdminProductOutcome, { ok: false }>) {
  if (res.code === 'VALIDATION_ERROR') return fail('VALIDATION_ERROR', res.detail ?? 'Dữ liệu product không hợp lệ', { status: 400 })
  if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy product', { status: 404 })
  return fail('INTERNAL', 'Không lưu được product', { status: 500 })
}

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await createProduct(createAdminClient(), raw)
  if (!res.ok) return mapFail(res)
  return ok({ product_id: res.product_id, status: res.status }, { status: 201 })
}

export async function PATCH(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await updateProduct(createAdminClient(), raw)
  if (!res.ok) return mapFail(res)
  return ok({ product_id: res.product_id, status: res.status })
}

// GET list — admin-only, BAO cả draft/hidden (khác catalog public). Metadata-only.
export async function GET() {
  const g = await requireAdminApi()
  if (!g.ok) return g.res

  const res = await listProducts(createAdminClient())
  if (!res.ok) return fail('INTERNAL', 'Không tải được danh sách product', { status: 500 })
  return ok({ items: res.items })
}
