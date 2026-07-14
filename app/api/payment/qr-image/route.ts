import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { buildSepayQrUrl, sepayConfigured } from '@/lib/payments/sepay'
import { fetchWithDeadline, readCappedArrayBuffer, QR_MAX_BYTES } from '@/lib/net/fetch-deadline'

// A1-alt — proxy ảnh VietQR qua server (same-origin): adblock/DNS phía client chặn qr.sepay.vn
//   sẽ không làm hỏng trang thanh toán; URL ảnh cũng không lộ số tài khoản/bank ra markup.
//   Owner-guard như /api/payment/status: chỉ chủ giao dịch lấy được QR của phiên nạp.
const RefSchema = z.string().regex(/^TOPUP-[0-9a-f]{18}$/)

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  if (!sepayConfigured()) return NextResponse.json({ message: 'not configured' }, { status: 503 })

  const ref = new URL(request.url).searchParams.get('ref') ?? ''
  if (!RefSchema.safeParse(ref).success) return NextResponse.json({ message: 'invalid ref' }, { status: 400 })

  const admin = createAdminClient()
  const { data: txn } = await admin
    .from('transactions')
    .select('amount_vnd')
    .eq('provider_txn_id', ref)
    .eq('user_id', user.id) // owner-only
    .eq('type', 'topup')
    .maybeSingle()
  if (!txn || txn.amount_vnd == null) return NextResponse.json({ message: 'not found' }, { status: 404 })

  try {
    // PAY-006 — deadline: upstream QR treo → abort (không treo request). Host cố định (sepay) → không SSRF.
    const upstream = await fetchWithDeadline(buildSepayQrUrl({ amountVnd: txn.amount_vnd, ref }), {
      // QR là hàm thuần của (acc,bank,amount,des) — cache theo URL upstream vô hại.
      next: { revalidate: 3600 },
    })
    // qr.sepay.vn trả LỖI dạng text với HTTP 200 (vd "Tài khoản ngân hàng phải chứa chữ hoặc số")
    //   → chỉ stream khi content-type là ảnh thật; còn lại 502 + log để thấy nguyên nhân ở server.
    const upstreamType = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !upstreamType.startsWith('image/')) {
      console.error(`[payment/qr-image] upstream không trả ảnh (status=${upstream.status}, type=${upstreamType})`)
      return NextResponse.json({ message: 'qr upstream error' }, { status: 502 })
    }
    // PAY-006 — đọc CÓ CAP: body vượt QR_MAX_BYTES → hủy stream → 502 (chống body khổng lồ).
    const png = await readCappedArrayBuffer(upstream, QR_MAX_BYTES)
    if (!png) {
      console.error(`[payment/qr-image] upstream body vượt cap ${QR_MAX_BYTES}B (type=${upstreamType})`)
      return NextResponse.json({ message: 'qr upstream error' }, { status: 502 })
    }
    return new NextResponse(png, {
      status: 200,
      headers: {
        'content-type': upstreamType,
        'cache-control': 'private, max-age=300', // QR của phiên — cache riêng tư, ngắn
      },
    })
  } catch {
    // Bao gồm TimeoutError (quá hạn) — trả 502 an toàn, KHÔNG lộ chi tiết upstream.
    return NextResponse.json({ message: 'qr upstream error' }, { status: 502 })
  }
}
