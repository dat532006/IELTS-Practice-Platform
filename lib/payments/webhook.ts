import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// W15 — Payment webhook signature verify (M08). SERVER-ONLY. Theo payment_redeem_contract §3.
//   ⚠️ Sandbox scheme: HMAC-SHA256 canonical (sort key, trừ 'signature') với PAYMENT_WEBHOOK_SECRET.
//   Provider thật (VNPay/MoMo) có scheme riêng → thay khi có keys (Owner/DevOps). Redirect client KHÔNG là nguồn.
//   secret server-only (KHÔNG NEXT_PUBLIC_, KHÔNG log). Thiếu secret → KHÔNG verify được → reject (an toàn).
export function isWebhookConfigured(): boolean {
  return !!process.env.PAYMENT_WEBHOOK_SECRET
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export function signWebhookPayload(payload: Record<string, string | number>, secret: string): string {
  const canonical = Object.keys(payload)
    .filter((k) => k !== 'signature')
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join('&')
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
}

// Verify chữ ký webhook. Sai/thiếu secret → false (reject, KHÔNG cộng coin).
export function verifyWebhookSignature(payload: Record<string, string | number>, signature: string): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = signWebhookPayload(payload, secret)
  return constantTimeEqualHex(expected, signature)
}
