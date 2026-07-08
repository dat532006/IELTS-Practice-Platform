import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyVnpayIpn, mapVnpayIpn, vnpayConfigured } from '@/lib/payments/vnpay'
import { settleVerifiedTopup } from '@/lib/payments/settle'

// A1 — VNPay IPN (server-to-server, GET + query vnp_*). Response theo format VNPay yêu cầu:
//   HTTP 200 + JSON { RspCode, Message } ('00' đã xử lý, '02' đã confirm/không có đơn, '04' sai tiền,
//   '97' sai chữ ký, '99' lỗi khác). KHÔNG dùng envelope chuẩn — VNPay parse format riêng.
// Bất biến: verify chữ ký TRƯỚC mọi xử lý; credit qua settleVerifiedTopup (amount fail-closed,
//   idempotent); redirect client (vnp_ReturnUrl) KHÔNG BAO GIỜ credit.
// ⚠️ Cần chạy matrix với sandbox chính thức VNPay trước khi live (chưa có merchant creds).
function rsp(code: string, message: string) {
  return NextResponse.json({ RspCode: code, Message: message })
}

export async function GET(request: Request) {
  if (!vnpayConfigured()) return rsp('99', 'Gateway not configured')

  const url = new URL(request.url)
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => {
    query[k] = v
  })

  if (!verifyVnpayIpn(query)) return rsp('97', 'Invalid signature')

  const { txnId, amountVnd, outcome } = mapVnpayIpn(query)
  if (!txnId) return rsp('01', 'Order not found')

  const result = await settleVerifiedTopup(createAdminClient(), 'vnpay', txnId, amountVnd, outcome)
  if (!result.ok) {
    return result.code === 'PAYMENT_AMOUNT_MISMATCH' ? rsp('04', 'Invalid amount') : rsp('99', 'Unknown error')
  }
  if (outcome === 'failed') return rsp('00', 'Confirm success') // đã ghi nhận thất bại (pending→failed)
  // credited=false = retry/đã success trước đó (hoặc không có đơn creditable) → '02' để VNPay ngừng gửi lại.
  return result.credited ? rsp('00', 'Confirm success') : rsp('02', 'Order already confirmed')
}
