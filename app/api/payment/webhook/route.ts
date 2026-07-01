import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWebhookAdapter } from '@/lib/payments/gateway'
import { ok, fail } from '@/lib/api/response'

// POST /api/payment/webhook — provider gọi (KHÔNG user session). Theo payment_redeem_contract §3.
// Verify chữ ký server → idempotent credit (RPC credit_topup, pending→success, amount SERVER-side).
// ⚠️ Sandbox HMAC scheme; provider thật có scheme riêng (Owner keys). Redirect client KHÔNG là nguồn sự thật.
const WebhookSchema = z.object({
  provider: z.enum(['vnpay', 'momo', 'bank']),
  provider_txn_id: z.string().min(1).max(200),
  amount: z.number().int().optional(),
  status: z.string().max(40).optional(),
  signature: z.string().min(1).max(256),
})

export async function POST(request: Request) {
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = WebhookSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Payload không hợp lệ', { status: 400 })

  const { signature, ...payload } = parsed.data
  // Verify chữ ký theo provider (gateway seam). Sandbox HMAC hiện tại; cổng thật cắm ở lib/payments/gateway.ts.
  // Thiếu secret / sai chữ ký → reject (an toàn, KHÔNG cộng coin).
  const adapter = getWebhookAdapter(parsed.data.provider)
  if (!adapter.configured() || !adapter.verify(payload, signature)) {
    return fail('PAYMENT_SIGNATURE_INVALID', 'Chữ ký không hợp lệ', { status: 400 })
  }
  // Chỉ status success mới credit (idempotent ở RPC).
  if (parsed.data.status && parsed.data.status !== 'success') {
    return ok({ credited: false, status: parsed.data.status })
  }

  const admin = createAdminClient()

  // W16 — verify SỐ TIỀN khớp chính xác transaction (paid_vnd == amount_vnd).
  //   Lệch tiền → KHÔNG credit, KHÔNG mark success, giữ nguyên để đối soát (chưa có policy xử lý phần dư).
  //   amount_vnd null (row cũ trước migration) → bỏ qua check (backward-compat).
  //   F1: xét cả 'failed' (topup pending quá hạn đã bị reconcile dọn) — credit_topup phục hồi được,
  //       nên amount vẫn PHẢI verify trên đúng row đó, không chỉ 'pending'.
  if (parsed.data.amount !== undefined) {
    const { data: txn } = await admin
      .from('transactions')
      .select('amount_vnd')
      .eq('provider', parsed.data.provider)
      .eq('provider_txn_id', parsed.data.provider_txn_id)
      .eq('type', 'topup')
      .in('status', ['pending', 'failed'])
      .maybeSingle()
    const expected = (txn as { amount_vnd: number | null } | null)?.amount_vnd
    if (expected != null && parsed.data.amount !== expected) {
      console.error(
        `[payment/webhook] amount mismatch txn=${parsed.data.provider_txn_id} paid=${parsed.data.amount} expected=${expected}`,
      )
      return fail('PAYMENT_AMOUNT_MISMATCH', 'Số tiền thanh toán không khớp', { status: 400 })
    }
  }

  const { data, error } = await admin.rpc('credit_topup', {
    p_provider: parsed.data.provider,
    p_txn_id: parsed.data.provider_txn_id,
  })
  if (error) return fail('INTERNAL', 'Không xử lý được webhook', { status: 500 })

  const credited = (data as { credited?: boolean } | null)?.credited === true
  return ok({ credited })
}
