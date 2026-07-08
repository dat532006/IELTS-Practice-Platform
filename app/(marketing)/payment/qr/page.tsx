import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sepayBankInfo, sepayConfigured } from '@/lib/payments/sepay'
import { TopupQrPanel } from '@/components/payment/TopupQrPanel'
import { PaymentDisclaimer } from '@/components/payment/PaymentDisclaimer'

export const metadata: Metadata = { title: 'Nạp xương cá — chuyển khoản VietQR' }

// A1-alt — trang QR chuyển khoản (SePay, provider='bank'). Server component đọc transaction bằng
//   client CỦA USER (RLS own-row — không cần service role): guest → login; không phải chủ giao dịch
//   → RLS trả rỗng → 404. QR/bank info chỉ hiện cho owner phiên nạp.
const REF_RE = /^TOPUP-[0-9a-f]{18}$/

export default async function TopupQrPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const ref = typeof sp.ref === 'string' ? sp.ref : ''
  if (!REF_RE.test(ref)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/payment/qr?ref=${ref}`)

  const { data: txn } = await supabase
    .from('transactions')
    .select('status, amount_vnd, amount_coins, expires_at')
    .eq('provider_txn_id', ref)
    .eq('type', 'topup')
    .maybeSingle()
  if (!txn || txn.amount_vnd == null) notFound()

  if (!sepayConfigured()) {
    // Không lộ lý do kỹ thuật — phiên tạo được nghĩa là config đổi giữa chừng (hiếm).
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-[15px] font-semibold text-[#857F96]">
        Kênh chuyển khoản tạm không khả dụng — vui lòng thử lại sau hoặc liên hệ hỗ trợ.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-[#2A2740]">Nạp xương cá</h1>
      <p className="mt-1.5 text-[14px] font-semibold text-[#6A6480]">
        Chuyển khoản đúng nội dung — xương cá cộng tự động sau khi server xác minh giao dịch.
      </p>
      <div className="mt-5">
        <TopupQrPanel
          refCode={ref}
          amountVnd={txn.amount_vnd}
          amountCoins={txn.amount_coins ?? txn.amount_vnd / 1000}
          initialStatus={txn.status}
          expiresAt={txn.expires_at}
          // Proxy same-origin (adblock/DNS phía client chặn qr.sepay.vn không làm hỏng trang).
          qrUrl={`/api/payment/qr-image?ref=${ref}`}
          bank={sepayBankInfo()}
        />
      </div>
      <PaymentDisclaimer className="mt-6" />
    </div>
  )
}
