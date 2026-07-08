import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// A1 — settle topup từ IPN provider ĐÃ verify chữ ký (vnpay.ts / momo.ts gọi qua route riêng).
// Giữ NGUYÊN bất biến payment_redeem_contract §3:
//   • credit CHỈ khi outcome success + amount khớp CHÍNH XÁC transactions.amount_vnd (fail-closed
//     khi thiếu amount ở payload HOẶC amount_vnd null trên row — B-02/R2).
//   • 'failed' CHỈ đặt từ provider notification thất bại, và CHỈ pending→failed (không đè
//     success/expired); failed KHÔNG BAO GIỜ được credit lại (rls_smoke check36).
//   • Idempotent: credit_topup status-guard; IPN retry → credited:false.
export type SettleOutcome = 'success' | 'failed'
export type SettleResult =
  | { ok: true; credited: boolean; marked_failed?: boolean }
  | { ok: false; code: 'PAYMENT_AMOUNT_MISMATCH' | 'INTERNAL' }

export async function settleVerifiedTopup(
  admin: SupabaseClient,
  provider: 'vnpay' | 'momo' | 'bank',
  txnId: string,
  amountVnd: number | undefined,
  outcome: SettleOutcome,
): Promise<SettleResult> {
  if (outcome === 'failed') {
    // Provider báo thất bại → pending→failed (đúng chủ thể đặt 'failed' theo contract §3).
    const { error } = await admin
      .from('transactions')
      .update({ status: 'failed' })
      .eq('provider', provider)
      .eq('provider_txn_id', txnId)
      .eq('type', 'topup')
      .eq('status', 'pending')
    if (error) return { ok: false, code: 'INTERNAL' }
    return { ok: true, credited: false, marked_failed: true }
  }

  // Nhánh credit: amount BẮT BUỘC (fail-closed R2).
  if (amountVnd === undefined) return { ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' }

  const { data: txn } = await admin
    .from('transactions')
    .select('amount_vnd')
    .eq('provider', provider)
    .eq('provider_txn_id', txnId)
    .eq('type', 'topup')
    .in('status', ['pending', 'expired'])
    .maybeSingle()
  const row = txn as { amount_vnd: number | null } | null
  if (row && row.amount_vnd == null) {
    console.error(`[payments/settle] missing amount_vnd on creditable txn=${txnId} — fail-closed`)
    return { ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' }
  }
  if (row && amountVnd !== row.amount_vnd) {
    console.error(`[payments/settle] amount mismatch txn=${txnId} paid=${amountVnd} expected=${row.amount_vnd}`)
    return { ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' }
  }

  const { data, error } = await admin.rpc('credit_topup', { p_provider: provider, p_txn_id: txnId })
  if (error) return { ok: false, code: 'INTERNAL' }
  return { ok: true, credited: (data as { credited?: boolean } | null)?.credited === true }
}
