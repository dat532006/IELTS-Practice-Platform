import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// A1-alt — SePay adapter (chuyển khoản VietQR + webhook biến động số dư, provider='bank').
//   SePay KHÔNG phải cổng thanh toán: user chuyển khoản thẳng vào TK ngân hàng Owner (QR pre-fill
//   số tiền + nội dung = provider_txn_id); SePay bắn webhook khi tiền vào; server khớp mã trong
//   nội dung CK + số tiền rồi credit qua settleVerifiedTopup (idempotent, amount fail-closed).
// Env (server-only): auth webhook chọn 1 trong 2 (HMAC ưu tiên nếu set cả hai):
//   • SEPAY_WEBHOOK_SECRET — HMAC-SHA256 (khuyến nghị của SePay): header `X-SePay-Signature:
//     sha256=<hex>` + `X-SePay-Timestamp` (Unix giây); chuỗi ký = `{timestamp}.{raw_body}` trên RAW
//     body bytes (developer.sepay.vn/vi/sepay-webhooks/xac-thuc). Chống giả mạo + replay (±5 phút).
//   • SEPAY_API_KEY — header "Authorization: Apikey <key>" (đơn giản hơn, secret lộ trên mỗi request).
//   SEPAY_BANK_ACCOUNT + SEPAY_BANK_CODE (+ SEPAY_ACCOUNT_NAME tùy chọn) cho VietQR.
// Bất biến giữ nguyên (payment_redeem_contract §3): bank transfer KHÔNG có notification thất bại
//   → không bao giờ đặt 'failed'; user chuyển muộn sau khi pending bị reconcile đánh 'expired'
//   → webhook đến muộn vẫn credit (F1). Docs: https://docs.sepay.vn/tich-hop-webhooks.html

// Env luôn .trim() — khoảng trắng/xuống dòng dính khi copy-paste vào Vercel từng làm qr.sepay.vn
//   từ chối acc ("Tài khoản ngân hàng phải chứa chữ hoặc số", 2026-07-08) và sẽ phá cả HMAC.
const env = (name: string): string => (process.env[name] ?? '').trim()

export function sepayConfigured(): boolean {
  const hasAuth = !!env('SEPAY_WEBHOOK_SECRET') || !!env('SEPAY_API_KEY')
  return hasAuth && !!env('SEPAY_BANK_ACCOUNT') && !!env('SEPAY_BANK_CODE')
}

function tsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  try {
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

// Verify header "Authorization: Apikey <key>" (timing-safe). Thiếu/sai/không cấu hình → false.
function verifySepayApiKey(headers: Headers): boolean {
  const expected = env('SEPAY_API_KEY')
  const m = (headers.get('authorization') ?? '').match(/^Apikey\s+(.+)$/i)
  if (!expected || !m) return false
  return tsEqual(m[1], expected)
}

// HMAC-SHA256 theo spec SePay: sig = hex(HMAC(secret, `${X-SePay-Timestamp}.${raw_body}`));
//   header `X-SePay-Signature: sha256=<hex>`. Timestamp lệch quá ±5 phút → reject (chống replay).
const SEPAY_TS_TOLERANCE_SEC = 300
function verifySepayHmac(headers: Headers, rawBody: string): boolean {
  const secret = env('SEPAY_WEBHOOK_SECRET')
  if (!secret) return false
  const sigHeader = headers.get('x-sepay-signature') ?? ''
  const ts = headers.get('x-sepay-timestamp') ?? ''
  const m = sigHeader.match(/^(?:sha256=)?([0-9a-f]{64})$/i)
  if (!m || !/^\d{1,12}$/.test(ts)) return false
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts))
  if (skew > SEPAY_TS_TOLERANCE_SEC) return false
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`, 'utf8').digest('hex')
  return tsEqual(m[1].toLowerCase(), expected)
}

// Verify webhook: HMAC ưu tiên khi SEPAY_WEBHOOK_SECRET set; fallback API key. Cả hai fail → false.
export function verifySepayWebhook(headers: Headers, rawBody: string): boolean {
  if (env('SEPAY_WEBHOOK_SECRET')) return verifySepayHmac(headers, rawBody)
  return verifySepayApiKey(headers)
}

export type SepayWebhookBody = {
  id?: number | string // id giao dịch phía SePay (dùng để log/đối soát)
  gateway?: string
  transactionDate?: string
  accountNumber?: string
  subAccount?: string | null
  code?: string | null // mã SePay tự tách theo cấu hình (nếu có) — ưu tiên dùng
  content?: string | null // nội dung chuyển khoản thô
  transferType?: string // 'in' | 'out'
  transferAmount?: number
  referenceCode?: string | null
  description?: string | null
}

// Tách provider_txn_id (TOPUP-<18 hex>) từ code/content. Ngân hàng có thể UPPERCASE hoặc nuốt
// dấu '-' trong nội dung CK → match linh hoạt, chuẩn hoá về dạng lưu trong DB (hex thường).
export function extractTopupRef(body: SepayWebhookBody): string | null {
  for (const src of [body.code, body.content, body.description]) {
    if (!src) continue
    const m = String(src).match(/TOPUP[\s-]?([0-9a-fA-F]{18})/i)
    if (m) return `TOPUP-${m[1].toLowerCase()}`
  }
  return null
}

// VietQR image từ dịch vụ công khai của SePay (chỉ nhận acc/bank/amount/des — KHÔNG secret).
export function buildSepayQrUrl(input: { amountVnd: number; ref: string }): string {
  const p = new URLSearchParams({
    acc: env('SEPAY_BANK_ACCOUNT'),
    bank: env('SEPAY_BANK_CODE'),
    amount: String(input.amountVnd),
    des: input.ref,
  })
  return `https://qr.sepay.vn/img?${p.toString()}`
}

// PAY-002 — chuẩn hoá số tài khoản để so khớp beneficiary: bỏ ký tự không phải chữ/số, viết hoa.
//   Chống lệch format (khoảng trắng/dấu '-') mà vẫn khớp đúng tài khoản người bán.
function normalizeAccount(v: string | null | undefined): string {
  return (v ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
}

// PAY-002 — event SePay (đã verify HMAC) có VÀO ĐÚNG tài khoản người bán (SEPAY_BANK_ACCOUNT) không.
//   Event ký hợp lệ nhưng accountNumber khác (định tuyến sai / cấu hình người khác) KHÔNG được credit.
//   Fail-closed: thiếu accountNumber hoặc chưa cấu hình tài khoản → false. So cả subAccount (VA ảo).
export function sepayBeneficiaryMatches(body: SepayWebhookBody): boolean {
  const expected = normalizeAccount(env('SEPAY_BANK_ACCOUNT'))
  if (!expected) return false
  const acct = normalizeAccount(body.accountNumber)
  const sub = normalizeAccount(body.subAccount)
  return (!!acct && acct === expected) || (!!sub && sub === expected)
}

export function sepayBankInfo(): { account: string; bank: string; name: string | null } {
  return {
    account: env('SEPAY_BANK_ACCOUNT'),
    bank: env('SEPAY_BANK_CODE'),
    name: env('SEPAY_ACCOUNT_NAME') || null,
  }
}
