import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'
import { vndToCoins, COIN_VND_RATE, MIN_TOPUP_VND, MAX_TOPUP_VND } from '@/lib/payments/topup'

// POST /api/payment/create — khởi tạo topup (M08, W16). Fixed-rate 1.000 VND = 1 coin.
// Client CHỈ gửi { amount_vnd, provider }. Server tự tính amount_coins = amount_vnd / COIN_VND_RATE.
//   Field coin client gửi thừa (vd amount_coins) bị Zod loại → KHÔNG tin client. KHÔNG cộng coin ở đây
//   (chỉ webhook sau verify chữ ký + verify số tiền). amount_vnd phải chia hết COIN_VND_RATE (reject, KHÔNG floor).
// ⚠️ redirect_url = sandbox placeholder; tích hợp payUrl thật (VNPay/MoMo) khi có keys (Owner/DevOps).
const TOPUP_PENDING_TTL_MS = 30 * 60 * 1000 // 30 phút

const CreateSchema = z.object({
  amount_vnd: z.number().int().positive(),
  provider: z.enum(['vnpay', 'momo', 'bank']),
})

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', { status: 400 })

  // Server enforce min/max/%rate. KHÔNG dùng floor — lệch tỷ giá → reject.
  const conv = vndToCoins(parsed.data.amount_vnd)
  if (!conv.ok) {
    const msg =
      conv.reason === 'BELOW_MIN' ? `Số tiền nạp tối thiểu ${MIN_TOPUP_VND.toLocaleString('vi-VN')} VND` :
      conv.reason === 'ABOVE_MAX' ? `Số tiền nạp tối đa ${MAX_TOPUP_VND.toLocaleString('vi-VN')} VND` :
      conv.reason === 'NOT_DIVISIBLE' ? `Số tiền phải chia hết cho ${COIN_VND_RATE.toLocaleString('vi-VN')} VND` :
      'Số tiền không hợp lệ'
    return fail('VALIDATION_ERROR', msg, { status: 400 })
  }

  const provider_txn_id = 'TOPUP-' + randomBytes(9).toString('hex')
  const admin = createAdminClient()
  const { error } = await admin.from('transactions').insert({
    user_id: user.id,
    amount_vnd: parsed.data.amount_vnd, // fiat phải trả (webhook verify khớp)
    amount_coins: conv.coins,           // server tính; coin CHỈ cộng ở webhook sau verify
    type: 'topup',
    provider: parsed.data.provider,
    provider_txn_id,
    status: 'pending',
    expires_at: new Date(Date.now() + TOPUP_PENDING_TTL_MS).toISOString(),
  })
  if (error) return fail('INTERNAL', 'Không khởi tạo được thanh toán', { status: 500 })

  const redirect_url = `https://sandbox.payments.local/pay?provider=${parsed.data.provider}&ref=${provider_txn_id}&amount=${parsed.data.amount_vnd}`
  return ok(
    { redirect_url, provider_txn_id, amount_vnd: parsed.data.amount_vnd, amount_coins: conv.coins, status: 'pending' },
    { status: 201 },
  )
}
