import 'server-only'
import { timingSafeEqual } from 'node:crypto'

// A1-alt — SePay adapter (chuyển khoản VietQR + webhook biến động số dư, provider='bank').
//   SePay KHÔNG phải cổng thanh toán: user chuyển khoản thẳng vào TK ngân hàng Owner (QR pre-fill
//   số tiền + nội dung = provider_txn_id); SePay bắn webhook khi tiền vào; server khớp mã trong
//   nội dung CK + số tiền rồi credit qua settleVerifiedTopup (idempotent, amount fail-closed).
// Env (server-only): SEPAY_API_KEY (auth webhook — SePay gửi header "Authorization: Apikey <key>"),
//   SEPAY_BANK_ACCOUNT + SEPAY_BANK_CODE (+ SEPAY_ACCOUNT_NAME tùy chọn) cho VietQR.
// Bất biến giữ nguyên (payment_redeem_contract §3): bank transfer KHÔNG có notification thất bại
//   → không bao giờ đặt 'failed'; user chuyển muộn sau khi pending bị reconcile đánh 'expired'
//   → webhook đến muộn vẫn credit (F1). Docs: https://docs.sepay.vn/tich-hop-webhooks.html

export function sepayConfigured(): boolean {
  return !!process.env.SEPAY_API_KEY && !!process.env.SEPAY_BANK_ACCOUNT && !!process.env.SEPAY_BANK_CODE
}

// Verify header "Authorization: Apikey <key>" (timing-safe). Thiếu/sai/không cấu hình → false.
export function verifySepayAuth(headers: Headers): boolean {
  const expected = process.env.SEPAY_API_KEY
  const auth = headers.get('authorization') ?? ''
  const m = auth.match(/^Apikey\s+(.+)$/i)
  if (!expected || !m) return false
  const got = Buffer.from(m[1], 'utf8')
  const want = Buffer.from(expected, 'utf8')
  if (got.length !== want.length) return false
  try {
    return timingSafeEqual(got, want)
  } catch {
    return false
  }
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
  const acc = process.env.SEPAY_BANK_ACCOUNT ?? ''
  const bank = process.env.SEPAY_BANK_CODE ?? ''
  const p = new URLSearchParams({ acc, bank, amount: String(input.amountVnd), des: input.ref })
  return `https://qr.sepay.vn/img?${p.toString()}`
}

export function sepayBankInfo(): { account: string; bank: string; name: string | null } {
  return {
    account: process.env.SEPAY_BANK_ACCOUNT ?? '',
    bank: process.env.SEPAY_BANK_CODE ?? '',
    name: process.env.SEPAY_ACCOUNT_NAME ?? null,
  }
}
