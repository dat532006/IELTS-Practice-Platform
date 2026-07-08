import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMomoIpn, mapMomoIpn, momoConfigured, type MomoIpnBody } from '@/lib/payments/momo'
import { settleVerifiedTopup } from '@/lib/payments/settle'

// A1 — MoMo IPN (server-to-server, POST JSON). MoMo coi HTTP 204 (no content) là đã nhận thành công;
//   status khác sẽ được MoMo retry. KHÔNG dùng envelope chuẩn.
// Bất biến: verify chữ ký TRƯỚC mọi xử lý; credit qua settleVerifiedTopup (amount fail-closed,
//   idempotent); redirectUrl KHÔNG BAO GIỜ credit.
// ⚠️ Cần chạy matrix với sandbox chính thức MoMo trước khi live (chưa có partner creds).
export async function POST(request: Request) {
  if (!momoConfigured()) return NextResponse.json({ message: 'Gateway not configured' }, { status: 503 })

  let body: MomoIpnBody
  try {
    body = (await request.json()) as MomoIpnBody
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 })
  }

  if (!verifyMomoIpn(body)) return NextResponse.json({ message: 'Invalid signature' }, { status: 400 })

  const { txnId, amountVnd, outcome } = mapMomoIpn(body)
  if (!txnId) return NextResponse.json({ message: 'Missing orderId' }, { status: 400 })

  const result = await settleVerifiedTopup(createAdminClient(), 'momo', txnId, amountVnd, outcome)
  if (!result.ok) {
    // Amount mismatch → 400 để giữ log phía MoMo; KHÔNG credit, giữ pending để đối soát.
    return NextResponse.json({ message: result.code }, { status: 400 })
  }
  return new NextResponse(null, { status: 204 })
}
