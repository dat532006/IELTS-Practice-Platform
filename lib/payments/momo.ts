import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// A1 — MoMo adapter (API v2, requestType captureWallet). SERVER-ONLY.
//   Env: MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET, MOMO_ENDPOINT (mặc định test-payment sandbox).
// ⚠️ Chữ ký theo spec công khai MoMo v2 (HMAC-SHA256 trên chuỗi field THỨ TỰ CỐ ĐỊNH alphabet).
//   CHƯA chạy được với sandbox chính thức (cần partner creds từ Owner) — bắt buộc verify trước khi live.
// Bất biến giữ nguyên: chỉ IPN verify chữ ký + khớp tiền mới credit; 'failed' CHỈ do provider đặt.

const MOMO_SANDBOX_ENDPOINT = 'https://test-payment.momo.vn'

export function momoConfigured(): boolean {
  return !!process.env.MOMO_PARTNER_CODE && !!process.env.MOMO_ACCESS_KEY && !!process.env.MOMO_SECRET
}

function hmac256(raw: string, secret: string): string {
  return createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
}

// Tạo phiên thanh toán → payUrl (server-to-server). Lỗi mạng/resultCode ≠ 0 → ok:false (KHÔNG lộ secret).
export async function createMomoPayment(input: {
  amountVnd: number
  orderId: string
  orderInfo: string
  redirectUrl: string
  ipnUrl: string
}): Promise<{ ok: true; payUrl: string } | { ok: false; reason: string }> {
  const partnerCode = process.env.MOMO_PARTNER_CODE
  const accessKey = process.env.MOMO_ACCESS_KEY
  const secret = process.env.MOMO_SECRET
  if (!partnerCode || !accessKey || !secret) return { ok: false, reason: 'MOMO_NOT_CONFIGURED' }

  const requestId = input.orderId // 1 topup = 1 request; idempotent theo orderId phía MoMo
  const requestType = 'captureWallet'
  const extraData = ''
  // Thứ tự field cố định theo spec create (alphabet) — KHÔNG đổi thứ tự.
  const rawSignature =
    `accessKey=${accessKey}&amount=${input.amountVnd}&extraData=${extraData}` +
    `&ipnUrl=${input.ipnUrl}&orderId=${input.orderId}&orderInfo=${input.orderInfo}` +
    `&partnerCode=${partnerCode}&redirectUrl=${input.redirectUrl}` +
    `&requestId=${requestId}&requestType=${requestType}`
  const signature = hmac256(rawSignature, secret)

  const endpoint = (process.env.MOMO_ENDPOINT || MOMO_SANDBOX_ENDPOINT).replace(/\/$/, '')
  try {
    const res = await fetch(`${endpoint}/v2/gateway/api/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partnerCode,
        requestId,
        amount: input.amountVnd,
        orderId: input.orderId,
        orderInfo: input.orderInfo,
        redirectUrl: input.redirectUrl,
        ipnUrl: input.ipnUrl,
        lang: 'vi',
        extraData,
        requestType,
        signature,
      }),
    })
    const body = (await res.json().catch(() => null)) as { resultCode?: number; payUrl?: string } | null
    if (!res.ok || !body || body.resultCode !== 0 || !body.payUrl) {
      return { ok: false, reason: `MOMO_CREATE_FAILED_${body?.resultCode ?? res.status}` }
    }
    return { ok: true, payUrl: body.payUrl }
  } catch {
    return { ok: false, reason: 'MOMO_NETWORK_ERROR' }
  }
}

export type MomoIpnBody = {
  partnerCode?: string
  orderId?: string
  requestId?: string
  amount?: number
  orderInfo?: string
  orderType?: string
  transId?: number
  resultCode?: number
  message?: string
  payType?: string
  responseTime?: number
  extraData?: string
  signature?: string
}

// Verify chữ ký IPN — thứ tự field cố định theo spec IPN (khác thứ tự create).
export function verifyMomoIpn(body: MomoIpnBody): boolean {
  const accessKey = process.env.MOMO_ACCESS_KEY
  const secret = process.env.MOMO_SECRET
  const received = body.signature
  if (!accessKey || !secret || !received || !/^[0-9a-f]+$/i.test(received)) return false
  const raw =
    `accessKey=${accessKey}&amount=${body.amount ?? ''}&extraData=${body.extraData ?? ''}` +
    `&message=${body.message ?? ''}&orderId=${body.orderId ?? ''}&orderInfo=${body.orderInfo ?? ''}` +
    `&orderType=${body.orderType ?? ''}&partnerCode=${body.partnerCode ?? ''}&payType=${body.payType ?? ''}` +
    `&requestId=${body.requestId ?? ''}&responseTime=${body.responseTime ?? ''}` +
    `&resultCode=${body.resultCode ?? ''}&transId=${body.transId ?? ''}`
  const expected = hmac256(raw, secret)
  if (expected.length !== received.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received.toLowerCase(), 'hex'))
  } catch {
    return false
  }
}

export function mapMomoIpn(body: MomoIpnBody): {
  txnId: string
  amountVnd: number | undefined
  outcome: 'success' | 'failed'
} {
  const amountVnd = Number.isInteger(body.amount) && (body.amount as number) > 0 ? (body.amount as number) : undefined
  return { txnId: body.orderId ?? '', amountVnd, outcome: body.resultCode === 0 ? 'success' : 'failed' }
}
