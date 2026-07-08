import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'
import { vndToCoins, COIN_VND_RATE, MIN_TOPUP_VND, MAX_TOPUP_VND } from '@/lib/payments/topup'
import { getGatewayMode } from '@/lib/payments/gateway'
import { buildVnpayPayUrl, vnpayConfigured } from '@/lib/payments/vnpay'
import { createMomoPayment, momoConfigured } from '@/lib/payments/momo'
import { extractTrustedClientIp } from '@/lib/rate-limit/ai-ip'
import { SITE_URL } from '@/lib/site'

// POST /api/payment/create — khởi tạo topup (M08, W16). Fixed-rate 1.000 VND = 1 coin.
// Client CHỈ gửi { amount_vnd, provider }. Server tự tính amount_coins = amount_vnd / COIN_VND_RATE.
//   Field coin client gửi thừa (vd amount_coins) bị Zod loại → KHÔNG tin client. KHÔNG cộng coin ở đây
//   (chỉ webhook/IPN sau verify chữ ký + verify số tiền). amount_vnd phải chia hết COIN_VND_RATE (reject, KHÔNG floor).
// A1 (2026-07-08) — redirect theo PAYMENT_GATEWAY_MODE (lib/payments/gateway.ts):
//   sandbox (mặc định) = placeholder như cũ · live = payUrl thật VNPay/MoMo (cần env creds; ⚠️ chưa
//   verify với sandbox chính thức — cần merchant) · disabled = 503 (không tạo pending rác — S-01).
const TOPUP_PENDING_TTL_MS = 30 * 60 * 1000 // 30 phút

// B-04 (review fix) — cap số topup pending CHƯA hết hạn / user: chống spam tạo pending (rác ledger/đối soát).
//   Pending quá hạn do cron dọn ('expired') không tính vào cap. Override qua env TOPUP_MAX_PENDING.
const DEFAULT_MAX_PENDING_TOPUPS = 10
function getMaxPendingTopups(): number {
  const raw = Number.parseInt(process.env.TOPUP_MAX_PENDING ?? '', 10)
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_PENDING_TOPUPS
  return Math.min(raw, 100)
}

const CreateSchema = z.object({
  amount_vnd: z.number().int().positive(),
  provider: z.enum(['vnpay', 'momo', 'bank']),
})

export async function POST(request: Request) {
  const mode = getGatewayMode()
  // disabled: chặn TRƯỚC mọi thứ — không tạo pending rác, user không gặp redirect chết (S-01).
  if (mode === 'disabled') {
    return fail('PAYMENT_NOT_CONFIGURED', 'Nạp xương cá sẽ mở khi cổng thanh toán hoàn tất', { status: 503 })
  }
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

  const admin = createAdminClient()

  // B-04: đếm pending chưa hết hạn của user TRƯỚC khi insert — vượt cap → 429 (không tạo thêm rác pending).
  const { count: pendingCount, error: cntErr } = await admin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('type', 'topup')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
  if (cntErr) return fail('INTERNAL', 'Không khởi tạo được thanh toán', { status: 500 })
  if ((pendingCount ?? 0) >= getMaxPendingTopups()) {
    return fail('RATE_LIMITED', 'Bạn có quá nhiều giao dịch nạp đang chờ, vui lòng hoàn tất hoặc chờ hết hạn', {
      status: 429,
    })
  }

  // live: provider phải có creds TRƯỚC khi insert (thiếu → 503, không tạo pending rác).
  if (mode === 'live') {
    const configured =
      (parsed.data.provider === 'vnpay' && vnpayConfigured()) ||
      (parsed.data.provider === 'momo' && momoConfigured())
    if (!configured) {
      return fail('PAYMENT_NOT_CONFIGURED', 'Cổng thanh toán này chưa sẵn sàng', { status: 503 })
    }
  }

  const provider_txn_id = 'TOPUP-' + randomBytes(9).toString('hex')
  const { error } = await admin.from('transactions').insert({
    user_id: user.id,
    amount_vnd: parsed.data.amount_vnd, // fiat phải trả (webhook/IPN verify khớp)
    amount_coins: conv.coins,           // server tính; coin CHỈ cộng ở webhook/IPN sau verify
    type: 'topup',
    provider: parsed.data.provider,
    provider_txn_id,
    status: 'pending',
    expires_at: new Date(Date.now() + TOPUP_PENDING_TTL_MS).toISOString(),
  })
  if (error) return fail('INTERNAL', 'Không khởi tạo được thanh toán', { status: 500 })

  let redirect_url: string
  if (mode === 'live' && parsed.data.provider === 'vnpay') {
    redirect_url = buildVnpayPayUrl({
      amountVnd: parsed.data.amount_vnd,
      txnRef: provider_txn_id,
      orderInfo: `Nap xuong ca ${conv.coins} coin`, // VNPay khuyến nghị không dấu
      ipAddr: (() => {
        const ip = extractTrustedClientIp(request.headers)
        return ip === 'unknown' ? '127.0.0.1' : ip
      })(),
      returnUrl: `${SITE_URL}/payment/return?provider=vnpay`,
    })
  } else if (mode === 'live' && parsed.data.provider === 'momo') {
    const momo = await createMomoPayment({
      amountVnd: parsed.data.amount_vnd,
      orderId: provider_txn_id,
      orderInfo: `Nap xuong ca ${conv.coins} coin`,
      redirectUrl: `${SITE_URL}/payment/return?provider=momo`,
      ipnUrl: `${SITE_URL}/api/payment/webhook/momo`,
    })
    if (!momo.ok) {
      // Txn giữ pending → cron reconcile dọn sau TTL; KHÔNG credit, KHÔNG lộ chi tiết lỗi cổng.
      console.error(`[payment/create] momo create failed: ${momo.reason} txn=${provider_txn_id}`)
      return fail('PAYMENT_GATEWAY_ERROR', 'Không kết nối được cổng thanh toán, vui lòng thử lại', { status: 502 })
    }
    redirect_url = momo.payUrl
  } else {
    // sandbox (mặc định) — placeholder như cũ, đủ chạy end-to-end smoke; KHÔNG phải production.
    redirect_url = `https://sandbox.payments.local/pay?provider=${parsed.data.provider}&ref=${provider_txn_id}&amount=${parsed.data.amount_vnd}`
  }

  return ok(
    { redirect_url, provider_txn_id, amount_vnd: parsed.data.amount_vnd, amount_coins: conv.coins, status: 'pending' },
    { status: 201 },
  )
}
