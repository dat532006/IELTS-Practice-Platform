import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'

// POST /api/admin/grants — Owner cấp trực tiếp VOL cho 1 tài khoản (KHÔNG cần key, KHÔNG trừ xu).
// LUẬT THÉP: requireAdmin TRƯỚC; unlock qua RPC admin_grant_products (service_role, atomic + expand test_unlocks).
// product_id = uuid cụ thể HOẶC 'all' (mọi product đã published).
const Body = z.object({
  email: z.string().email('Email không hợp lệ'),
  product_id: z.string().min(1),
})

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const email = parsed.data.email.trim()

  // Resolve tài khoản theo email (không phân biệt hoa/thường). profiles.email set lúc đăng ký.
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (profErr) return fail('INTERNAL', 'Không tra cứu được tài khoản', { status: 500 })
  if (!profile) return fail('NOT_FOUND', 'Không tìm thấy tài khoản với email này', { status: 404 })

  // Danh sách product cần cấp.
  let productIds: string[]
  if (parsed.data.product_id === 'all') {
    const { data: prods, error: prodErr } = await admin.from('products').select('id').eq('status', 'published')
    if (prodErr) return fail('INTERNAL', 'Không tải được danh sách sản phẩm', { status: 500 })
    productIds = (prods ?? []).map((p) => (p as { id: string }).id)
    if (productIds.length === 0) return fail('VALIDATION_ERROR', 'Chưa có sản phẩm nào ở trạng thái published', { status: 400 })
  } else {
    productIds = [parsed.data.product_id]
  }

  const { data, error } = await admin.rpc('admin_grant_products', {
    p_user_id: profile.id,
    p_product_ids: productIds,
  })
  if (error) return fail('INTERNAL', 'Không cấp được quyền', { status: 500 })

  const row = (data ?? {}) as { status?: string; granted?: number; requested?: number }
  if (row.status === 'USER_NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy tài khoản', { status: 404 })
  if (row.status !== 'OK') return fail('INTERNAL', 'Không cấp được quyền', { status: 500 })

  return ok({
    email: (profile as { email: string | null }).email,
    granted: row.granted ?? 0,
    requested: row.requested ?? productIds.length,
  })
}
