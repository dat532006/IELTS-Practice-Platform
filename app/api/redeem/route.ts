import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { redeemCode, type RedeemOutcome } from '@/lib/payments/redeem'
import { ok, fail } from '@/lib/api/response'

// POST /api/redeem — tiêu mã kích hoạt (M08, W15). Theo payment_redeem_contract §2.
// Auth bắt buộc; HMAC + RPC atomic (service_role). KHÔNG trả code_hash/pepper.
const MAP: Record<Extract<RedeemOutcome, { ok: false }>['code'], { status: number; msg: string }> = {
  CODE_NOT_FOUND: { status: 404, msg: 'Mã không tồn tại' },
  CODE_DISABLED: { status: 409, msg: 'Mã đã bị vô hiệu hoá' },
  CODE_EXPIRED: { status: 409, msg: 'Mã đã hết hạn' },
  CODE_SOLD_OUT: { status: 409, msg: 'Mã đã hết lượt sử dụng' },
  VALIDATION_ERROR: { status: 400, msg: 'Mã không hợp lệ' },
  INTERNAL: { status: 500, msg: 'Không xử lý được mã' },
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await redeemCode(createAdminClient(), user.id, raw)
  if (!res.ok) {
    const m = MAP[res.code]
    return fail(res.code, m.msg, { status: m.status })
  }
  return ok({ status: res.status, product_id: res.product_id })
}
