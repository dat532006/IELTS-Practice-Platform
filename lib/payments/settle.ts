import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '@/lib/obs/log-event'

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

// PAY-004 — ghi payment exception bền + dedup qua RPC (best-effort: lỗi ghi case KHÔNG được nuốt
//   quyết định fail-closed của settle, chỉ log). detail redacted (chỉ số tiền, KHÔNG secret/PII thô).
async function recordException(
  admin: SupabaseClient,
  provider: 'vnpay' | 'momo' | 'bank',
  txnId: string,
  paidVnd: number | null,
  expectedVnd: number | null,
  userId: string | null,
): Promise<void> {
  const { error } = await admin.rpc('record_payment_exception', {
    p_provider: provider,
    p_txn_id: txnId,
    p_kind: 'amount_mismatch',
    p_paid_vnd: paidVnd,
    p_expected_vnd: expectedVnd,
    p_user: userId,
    p_detail: { paid_vnd: paidVnd, expected_vnd: expectedVnd },
  })
  // KHÔNG log error.message thô (có thể chứa chi tiết nội bộ) — chỉ code có cấu trúc, đã redact.
  if (error) logEvent('payment.exception_record_error', 'error', { provider, txn: txnId, code: error.code ?? null })
}

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
    .select('amount_vnd, user_id')
    .eq('provider', provider)
    .eq('provider_txn_id', txnId)
    .eq('type', 'topup')
    .in('status', ['pending', 'expired'])
    .maybeSingle()
  const row = txn as { amount_vnd: number | null; user_id: string | null } | null
  if (row && row.amount_vnd == null) {
    logEvent('payment.amount_missing', 'critical', { provider, txn: txnId })
    // PAY-004 — ghi case bền để đối soát (dedup); KHÔNG credit.
    await recordException(admin, provider, txnId, amountVnd, null, row.user_id ?? null)
    return { ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' }
  }
  if (row && amountVnd !== row.amount_vnd) {
    logEvent('payment.amount_mismatch', 'error', { provider, txn: txnId, paid: amountVnd, expected: row.amount_vnd })
    await recordException(admin, provider, txnId, amountVnd, row.amount_vnd, row.user_id ?? null)
    return { ok: false, code: 'PAYMENT_AMOUNT_MISMATCH' }
  }

  const { data, error } = await admin.rpc('credit_topup', { p_provider: provider, p_txn_id: txnId })
  if (error) return { ok: false, code: 'INTERNAL' }
  return { ok: true, credited: (data as { credited?: boolean } | null)?.credited === true }
}
