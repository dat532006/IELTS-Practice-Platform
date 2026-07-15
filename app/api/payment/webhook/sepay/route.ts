import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySepayWebhook, extractTopupRef, sepayBeneficiaryMatches, sepayConfigured, type SepayWebhookBody } from '@/lib/payments/sepay'
import { recordPaymentException, settleVerifiedTopup } from '@/lib/payments/settle'
import { requestIdFrom } from '@/lib/api/response'
import { logEvent } from '@/lib/obs/log-event'

// A1-alt — SePay webhook (biến động số dư, provider='bank'). SePay yêu cầu response HTTP 200/201
//   + JSON {"success": true} trong 30s; khác đi sẽ retry (Fibonacci, tối đa 7 lần) → chỉ trả
//   non-2xx khi retry CÓ ÍCH (lỗi transient DB). Sai key → 401 (không xử lý).
// An toàn tiền: credit qua settleVerifiedTopup — amount fail-closed (transferAmount phải khớp
//   ĐÚNG amount_vnd), idempotent (retry/chuyển 2 lần cùng mã → không credit lần 2). Lệch tiền →
//   ACK + log để đối soát tay (retry không sửa được số tiền sai). KHÔNG bao giờ đặt 'failed'
//   (bank transfer không có notification thất bại — contract §3).
const ACK = () => NextResponse.json({ success: true })

export async function POST(request: Request) {
  const rid = requestIdFrom(request.headers) // DEPLOY-005: tương quan log với retry của SePay
  if (!sepayConfigured()) return NextResponse.json({ success: false, message: 'not configured' }, { status: 503 })

  // HMAC ký trên RAW body bytes (`{timestamp}.{raw_body}`) → PHẢI đọc text() trước rồi mới parse;
  //   request.json() sẽ mất raw chính xác (spec developer.sepay.vn — xác thực webhook).
  const rawBody = await request.text()
  if (!verifySepayWebhook(request.headers, rawBody)) {
    return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401 })
  }

  let body: SepayWebhookBody
  try {
    body = JSON.parse(rawBody) as SepayWebhookBody
  } catch {
    return NextResponse.json({ success: false, message: 'invalid json' }, { status: 400 })
  }

  // Chỉ quan tâm tiền VÀO; biến động ra/khác → ACK để SePay không retry.
  if (body.transferType !== 'in') return ACK()

  const ref = extractTopupRef(body)
  if (!ref) {
    // Giao dịch không mang mã TOPUP (CK tay ngoài luồng) → ACK + log để đối soát khi cần.
    logEvent('payment.sepay_no_ref', 'warn', { sepay_id: body.id ?? null }, { request_id: rid })
    return ACK()
  }

  const amount = Number.isInteger(body.transferAmount) && (body.transferAmount as number) > 0
    ? (body.transferAmount as number)
    : undefined
  const admin = createAdminClient()
  const { data: txnData, error: txnError } = await admin
    .from('transactions')
    .select('beneficiary_account, amount_vnd, user_id')
    .eq('provider', 'bank').eq('provider_txn_id', ref).eq('type', 'topup')
    .maybeSingle()
  if (txnError) return NextResponse.json({ success: false, message: 'internal' }, { status: 500 })
  const txn = txnData as {
    beneficiary_account: string | null; amount_vnd: number | null; user_id: string | null
  } | null

  // PAY-002 — bind beneficiary: tiền phải VÀO ĐÚNG tài khoản người bán. Event ký hợp lệ nhưng
  //   accountNumber khác (định tuyến sai / cấu hình bên thứ ba) → KHÔNG credit; ACK + log đối soát
  //   (retry vô ích vì beneficiary sai không tự sửa). Giữ pending để xử lý tay.
  if (!sepayBeneficiaryMatches(body, txn?.beneficiary_account ?? undefined)) {
    logEvent('payment.sepay_beneficiary_mismatch', 'error', { ref, sepay_id: body.id ?? null }, { request_id: rid })
    const recorded = await recordPaymentException(
      admin, 'bank', ref, 'beneficiary_mismatch',
      amount ?? null, txn?.amount_vnd ?? null, txn?.user_id ?? null,
    )
    if (!recorded) return NextResponse.json({ success: false, message: 'internal' }, { status: 500 })
    return ACK()
  }


  const result = await settleVerifiedTopup(admin, 'bank', ref, amount, 'success')
  if (!result.ok) {
    if (result.code === 'PAYMENT_AMOUNT_MISMATCH') {
      // User chuyển sai số tiền → KHÔNG credit, giữ pending để đối soát tay; ACK vì retry vô ích.
      logEvent('payment.amount_mismatch', 'error', { provider: 'bank', ref, paid: amount ?? null, sepay_id: body.id ?? null }, { request_id: rid })
      return ACK()
    }
    // transient → cho retry; đây là sự cố tới hạn (không settle được) cần quan sát.
    logEvent('payment.sepay_settle_error', 'critical', { ref, sepay_id: body.id ?? null }, { request_id: rid })
    return NextResponse.json({ success: false, message: 'internal' }, { status: 500 })
  }
  if (!result.credited) {
    // Retry / đã credit trước đó / user chuyển 2 lần cùng mã → không credit thêm; log lần dư.
    logEvent('payment.sepay_duplicate', 'info', { ref, sepay_id: body.id ?? null }, { request_id: rid })
  }
  return ACK()
}
