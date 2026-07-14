import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { checkoutCart, checkoutProduct } from '@/lib/payments/checkout'
import { ok, fail } from '@/lib/api/response'

// POST /api/checkout — mua bằng coin (M08, W15/W16). Theo payment_redeem_contract §1.
// Auth bắt buộc; server đọc price_coins; RPC atomic (conditional coin, expand test_unlocks, via='purchase').
//   - Body { product_id }  → Buy-now: checkout đúng 1 product, KHÔNG qua cart (UI VOL detail).
//   - KHÔNG body           → checkout toàn bộ cart_items (backward-compat).
const BuyNowSchema = z.object({ product_id: z.string().uuid() })

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  // PAY-001 — fail-closed intent: CHỈ "không body" (rỗng) mới rơi xuống checkout cart (backward-compat).
  //   Body CÓ mặt nhưng sai (không phải JSON / thiếu/xấu product_id) → 400, KHÔNG suy diễn thành mua cart.
  const rawBody = (await request.text()).trim()
  let productId: string | undefined
  if (rawBody !== '') {
    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 })
    }
    const parsed = BuyNowSchema.safeParse(json)
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Yêu cầu mua không hợp lệ', { status: 400 })
    productId = parsed.data.product_id
  }

  const admin = createAdminClient()
  const res = productId ? await checkoutProduct(admin, user.id, productId) : await checkoutCart(admin, user.id)
  if (!res.ok) {
    if (res.code === 'EMPTY_CART') return fail('EMPTY_CART', 'Giỏ hàng trống', { status: 400 })
    if (res.code === 'INSUFFICIENT_COINS') return fail('INSUFFICIENT_COINS', 'Không đủ coin', { status: 409 })
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Sản phẩm không tồn tại hoặc chưa phát hành', { status: 404 })
    return fail('INTERNAL', 'Không thanh toán được', { status: 500 })
  }
  if (res.status === 'already_owned') return ok({ status: 'already_owned' })
  return ok({ status: 'paid', total: res.total, order_id: res.order_id })
}
