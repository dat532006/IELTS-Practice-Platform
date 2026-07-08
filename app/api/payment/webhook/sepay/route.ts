import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifySepayAuth, extractTopupRef, sepayConfigured, type SepayWebhookBody } from '@/lib/payments/sepay'
import { settleVerifiedTopup } from '@/lib/payments/settle'

// A1-alt — SePay webhook (biến động số dư, provider='bank'). SePay yêu cầu response HTTP 200/201
//   + JSON {"success": true} trong 30s; khác đi sẽ retry (Fibonacci, tối đa 7 lần) → chỉ trả
//   non-2xx khi retry CÓ ÍCH (lỗi transient DB). Sai key → 401 (không xử lý).
// An toàn tiền: credit qua settleVerifiedTopup — amount fail-closed (transferAmount phải khớp
//   ĐÚNG amount_vnd), idempotent (retry/chuyển 2 lần cùng mã → không credit lần 2). Lệch tiền →
//   ACK + log để đối soát tay (retry không sửa được số tiền sai). KHÔNG bao giờ đặt 'failed'
//   (bank transfer không có notification thất bại — contract §3).
const ACK = () => NextResponse.json({ success: true })

export async function POST(request: Request) {
  if (!sepayConfigured()) return NextResponse.json({ success: false, message: 'not configured' }, { status: 503 })
  if (!verifySepayAuth(request.headers)) {
    return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401 })
  }

  let body: SepayWebhookBody
  try {
    body = (await request.json()) as SepayWebhookBody
  } catch {
    return NextResponse.json({ success: false, message: 'invalid json' }, { status: 400 })
  }

  // Chỉ quan tâm tiền VÀO; biến động ra/khác → ACK để SePay không retry.
  if (body.transferType !== 'in') return ACK()

  const ref = extractTopupRef(body)
  if (!ref) {
    // Giao dịch không mang mã TOPUP (CK tay ngoài luồng) → ACK + log để đối soát khi cần.
    console.warn(`[payment/sepay] incoming transfer without TOPUP ref (sepay_id=${body.id ?? '?'})`)
    return ACK()
  }

  const amount = Number.isInteger(body.transferAmount) && (body.transferAmount as number) > 0
    ? (body.transferAmount as number)
    : undefined

  const result = await settleVerifiedTopup(createAdminClient(), 'bank', ref, amount, 'success')
  if (!result.ok) {
    if (result.code === 'PAYMENT_AMOUNT_MISMATCH') {
      // User chuyển sai số tiền → KHÔNG credit, giữ pending để đối soát tay; ACK vì retry vô ích.
      console.error(`[payment/sepay] amount mismatch ref=${ref} paid=${amount ?? 'n/a'} (sepay_id=${body.id ?? '?'})`)
      return ACK()
    }
    return NextResponse.json({ success: false, message: 'internal' }, { status: 500 }) // transient → cho retry
  }
  if (!result.credited) {
    // Retry / đã credit trước đó / user chuyển 2 lần cùng mã → không credit thêm; log lần dư.
    console.warn(`[payment/sepay] duplicate/late notify ref=${ref} — no additional credit (sepay_id=${body.id ?? '?'})`)
  }
  return ACK()
}
