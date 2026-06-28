import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// W15 — Checkout orchestration (M08). SERVER-ONLY. Theo payment_redeem_contract §1.
//   Đọc cart của user (server) → RPC checkout (atomic: lọc owned, server-read price, conditional coin,
//   unlock + expand test_unlocks). KHÔNG tin giá client. Xoá cart sau khi xử lý.
export type CheckoutOutcome =
  | { ok: true; status: 'paid'; total: number; order_id: string }
  | { ok: true; status: 'already_owned' }
  | { ok: false; code: 'EMPTY_CART' | 'INSUFFICIENT_COINS' | 'NOT_FOUND' | 'INTERNAL'; detail?: string }

// Map kết quả RPC checkout → CheckoutOutcome (KHÔNG đụng cart).
function mapCheckoutRow(data: unknown): CheckoutOutcome {
  const row = (data ?? {}) as { status?: string; total?: number; order_id?: string }
  switch (row.status) {
    case 'OK': return { ok: true, status: 'paid', total: row.total as number, order_id: row.order_id as string }
    case 'ALREADY_OWNED': return { ok: true, status: 'already_owned' }
    case 'EMPTY_CART': return { ok: false, code: 'EMPTY_CART' }
    case 'INSUFFICIENT_COINS': return { ok: false, code: 'INSUFFICIENT_COINS' }
    default: return { ok: false, code: 'INTERNAL', detail: `unexpected status ${row.status}` }
  }
}

// W16 — Buy-now 1 product (M08). Gọi RPC checkout với đúng 1 product_id, KHÔNG qua cart.
//   Atomic/race-safe/idempotent y hệt checkout cart (cùng RPC). Chỉ cho product PUBLISHED.
export async function checkoutProduct(
  admin: SupabaseClient,
  userId: string,
  productId: string,
): Promise<CheckoutOutcome> {
  const { data: product } = await admin
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('status', 'published')
    .maybeSingle()
  if (!product) return { ok: false, code: 'NOT_FOUND' }

  const { data, error } = await admin.rpc('checkout', { p_user_id: userId, p_product_ids: [productId] })
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  return mapCheckoutRow(data)
}

export async function checkoutCart(admin: SupabaseClient, userId: string): Promise<CheckoutOutcome> {
  const { data: cart, error: cErr } = await admin.from('cart_items').select('product_id').eq('user_id', userId)
  if (cErr) return { ok: false, code: 'INTERNAL', detail: cErr.message }
  const productIds = [...new Set((cart ?? []).map((c) => (c as { product_id: string }).product_id))].filter(Boolean)
  if (productIds.length === 0) return { ok: false, code: 'EMPTY_CART' }

  const { data, error } = await admin.rpc('checkout', { p_user_id: userId, p_product_ids: productIds })
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }

  const row = (data ?? {}) as { status?: string; total?: number; order_id?: string }
  switch (row.status) {
    case 'OK':
      await admin.from('cart_items').delete().eq('user_id', userId).in('product_id', productIds)
      return { ok: true, status: 'paid', total: row.total as number, order_id: row.order_id as string }
    case 'ALREADY_OWNED':
      await admin.from('cart_items').delete().eq('user_id', userId).in('product_id', productIds)
      return { ok: true, status: 'already_owned' }
    case 'EMPTY_CART': return { ok: false, code: 'EMPTY_CART' }
    case 'INSUFFICIENT_COINS': return { ok: false, code: 'INSUFFICIENT_COINS' }
    default: return { ok: false, code: 'INTERNAL', detail: `unexpected status ${row.status}` }
  }
}
