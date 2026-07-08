import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// A1 — VNPay adapter (Pay API v2.1.0). SERVER-ONLY. Env: VNPAY_TMN_CODE, VNPAY_SECRET,
//   VNPAY_URL (mặc định sandbox chính thức của VNPay).
// ⚠️ Logic theo spec/sample code công khai của VNPay (HMAC-SHA512 trên query sort key,
//   value encode kiểu querystring với space='+'). CHƯA chạy được với sandbox chính thức
//   (cần merchant TMN code + secret từ Owner) — bắt buộc verify trên sandbox VNPay trước khi live.
// Bất biến giữ nguyên: redirect client KHÔNG là nguồn sự thật; chỉ IPN verify chữ ký + khớp tiền
//   mới credit (settleVerifiedTopup); 'failed' CHỈ do provider notification đặt (contract §3).

const VNPAY_SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

export function vnpayConfigured(): boolean {
  return !!process.env.VNPAY_SECRET && !!process.env.VNPAY_TMN_CODE
}

// Encode theo sample code VNPay: encodeURIComponent + space thành '+'.
function vnpEncode(v: string): string {
  return encodeURIComponent(v).replace(/%20/g, '+')
}

// Canonical: bỏ vnp_SecureHash/vnp_SecureHashType + value rỗng, sort key tăng dần, encode value.
function vnpCanonical(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && params[k] !== '')
    .sort()
    .map((k) => `${k}=${vnpEncode(params[k])}`)
    .join('&')
}

function vnpSign(canonical: string, secret: string): string {
  return createHmac('sha512', secret).update(canonical, 'utf8').digest('hex')
}

// yyyyMMddHHmmss theo GMT+7 (múi giờ VNPay yêu cầu).
function vnpDate(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3600_000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`
}

export function buildVnpayPayUrl(input: {
  amountVnd: number
  txnRef: string
  orderInfo: string
  ipAddr: string
  returnUrl: string
  expireMinutes?: number
}): string {
  const secret = process.env.VNPAY_SECRET
  const tmnCode = process.env.VNPAY_TMN_CODE
  if (!secret || !tmnCode) throw new Error('VNPay chưa cấu hình (VNPAY_SECRET/VNPAY_TMN_CODE)')
  const now = new Date()
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: input.orderInfo,
    vnp_OrderType: 'other',
    // VNPay nhận amount * 100 (đơn vị: đồng x100 để không có phần thập phân).
    vnp_Amount: String(input.amountVnd * 100),
    vnp_ReturnUrl: input.returnUrl,
    vnp_IpAddr: input.ipAddr,
    vnp_CreateDate: vnpDate(now),
    vnp_ExpireDate: vnpDate(new Date(now.getTime() + (input.expireMinutes ?? 30) * 60_000)),
  }
  const canonical = vnpCanonical(params)
  const signed = vnpSign(canonical, secret)
  const base = process.env.VNPAY_URL || VNPAY_SANDBOX_URL
  return `${base}?${canonical}&vnp_SecureHash=${signed}`
}

// Verify chữ ký IPN (GET query đã decode). Sai/thiếu secret → false (KHÔNG credit).
export function verifyVnpayIpn(query: Record<string, string>): boolean {
  const secret = process.env.VNPAY_SECRET
  const received = query.vnp_SecureHash
  if (!secret || !received || !/^[0-9a-f]+$/i.test(received)) return false
  const expected = vnpSign(vnpCanonical(query), secret)
  if (expected.length !== received.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received.toLowerCase(), 'hex'))
  } catch {
    return false
  }
}

// Map IPN → dữ liệu settle chuẩn hóa. amount của VNPay là VND*100 → chia lại; lẻ → null (fail-closed).
export function mapVnpayIpn(query: Record<string, string>): {
  txnId: string
  amountVnd: number | undefined
  outcome: 'success' | 'failed'
} {
  const raw = Number(query.vnp_Amount)
  const amountVnd = Number.isInteger(raw) && raw > 0 && raw % 100 === 0 ? raw / 100 : undefined
  const success =
    query.vnp_ResponseCode === '00' && (query.vnp_TransactionStatus ? query.vnp_TransactionStatus === '00' : true)
  return { txnId: query.vnp_TxnRef ?? '', amountVnd, outcome: success ? 'success' : 'failed' }
}
