import 'server-only'
import { verifyWebhookSignature, isWebhookConfigured } from './webhook'

// W16 — Gateway seam (M08, G4). SERVER-ONLY. Tách verify chữ ký theo provider để cắm cổng thật khi có keys.
//   Hiện tại MỌI provider dùng sandbox HMAC (PAYMENT_WEBHOOK_SECRET) — đủ để chạy end-to-end (KHÔNG phải production).
//   ⚠️ Provider thật có scheme chữ ký riêng:
//     • VNPay: HMAC-SHA512 secure hash trên query đã sort (vnp_SecureHash), key = VNPAY_SECRET.
//     • MoMo:  HMAC-SHA256 chữ ký theo thứ tự field cố định, key = MOMO_SECRET.
//   Khi Owner cấp keys thật → thay `verify`/`configured` của adapter tương ứng bằng scheme thật.
//   Redirect client KHÔNG BAO GIỜ là nguồn sự thật; chỉ webhook đã verify mới credit (credit_topup).
export type WebhookProvider = 'vnpay' | 'momo' | 'bank'
export type WebhookScheme = 'sandbox-hmac' | 'vnpay-securehash' | 'momo-hmac'

export type WebhookAdapter = {
  scheme: WebhookScheme
  // secret cần thiết đã cấu hình chưa (thiếu → reject, KHÔNG verify được → an toàn).
  configured: () => boolean
  // verify chữ ký webhook. payload đã loại field 'signature'. Trả false nếu sai/thiếu secret.
  verify: (payload: Record<string, string | number>, signature: string) => boolean
}

// Sandbox adapter — HMAC-SHA256 canonical (sort key) với PAYMENT_WEBHOOK_SECRET (lib/payments/webhook.ts).
const sandboxAdapter: WebhookAdapter = {
  scheme: 'sandbox-hmac',
  configured: isWebhookConfigured,
  verify: verifyWebhookSignature,
}

// Registry provider → adapter. Mặc định sandbox cho tới khi có keys/scheme thật (seam duy nhất cần đổi).
const ADAPTERS: Record<WebhookProvider, WebhookAdapter> = {
  vnpay: sandboxAdapter,
  momo: sandboxAdapter,
  bank: sandboxAdapter,
}

export function getWebhookAdapter(provider: WebhookProvider): WebhookAdapter {
  return ADAPTERS[provider] ?? sandboxAdapter
}

// true nếu MỌI adapter còn ở sandbox (chưa cắm cổng thật) → dùng để cảnh báo "sandbox only" ở report/gate.
export function isSandboxOnly(): boolean {
  return Object.values(ADAPTERS).every((a) => a.scheme === 'sandbox-hmac')
}
