import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'

// POST/DELETE /api/cart — thêm/xoá product khỏi giỏ (M08, W15). cart_items RW-own.
// Auth bắt buộc. Chỉ cho thêm product PUBLISHED (catalog). KHÔNG lưu giá ở cart (giá đọc lúc checkout).
const CartSchema = z.object({ product_id: z.string().uuid() })

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = CartSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'product_id không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const { data: product } = await admin.from('products').select('id').eq('id', parsed.data.product_id).eq('status', 'published').maybeSingle()
  if (!product) return fail('NOT_FOUND', 'Sản phẩm không tồn tại hoặc chưa phát hành', { status: 404 })

  const { error } = await admin.from('cart_items').upsert(
    { user_id: user.id, product_id: parsed.data.product_id },
    { onConflict: 'user_id,product_id' },
  )
  if (error) return fail('INTERNAL', 'Không thêm được vào giỏ', { status: 500 })
  return ok({ added: parsed.data.product_id }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await getSessionUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = CartSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'product_id không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('cart_items').delete().eq('user_id', user.id).eq('product_id', parsed.data.product_id)
  if (error) return fail('INTERNAL', 'Không xoá được khỏi giỏ', { status: 500 })
  return ok({ removed: parsed.data.product_id })
}
