import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/auth/guards'
import { buildSepayQrUrl, sepayConfigured } from '@/lib/payments/sepay'

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
    const upstream = await fetch(buildSepayQrUrl({ amountVnd: txn.amount_vnd, ref }), {
      // QR là hàm thuần của (acc,bank,amount,des) — cache theo URL upstream vô hại.
      next: { revalidate: 3600 },
    })
    if (!upstream.ok) return NextResponse.json({ message: 'qr upstream error' }, { status: 502 })
    const png = await upstream.arrayBuffer()
    return new NextResponse(png, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'image/png',
        'cache-control': 'private, max-age=300', // QR của phiên — cache riêng tư, ngắn
      },
    })
  } catch {
    return NextResponse.json({ message: 'qr upstream error' }, { status: 502 })
  }
}
