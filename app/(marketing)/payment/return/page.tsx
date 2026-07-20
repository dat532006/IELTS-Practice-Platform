import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Đang xác nhận thanh toán' }

// A1 — trang user quay về sau khi thanh toán ở cổng (vnp_ReturnUrl / MoMo redirectUrl).
// CHỈ hiển thị hướng dẫn tĩnh — KHÔNG đọc query để tuyên bố thành công/thất bại: redirect client
// không bao giờ là nguồn sự thật (payment_redeem_contract §3); xương cá chỉ cộng sau khi server
// verify IPN. Không render số liệu nào từ URL để khỏi bị giả mạo ?status=success.
export default function PaymentReturnPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="rounded-[20px] border border-[#EEEAF3] bg-white px-8 py-12 shadow-[0_20px_44px_-30px_rgba(60,40,90,0.35)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F0ECFF] text-[26px]">⏳</span>
        <h1 className="mt-5 text-[24px] font-extrabold tracking-[-0.02em] text-[#2A2740]">
          Đang xác nhận thanh toán…
        </h1>
        <p className="mt-3 text-[15px] leading-[1.65] text-[#5C5670]">
          Giao dịch của bạn đang được cổng thanh toán gửi về hệ thống để xác minh. Xương cá sẽ được cộng vào tài
          khoản <b className="text-[#2A2740]">sau khi server xác minh thành công</b> — thường trong vài giây, đôi khi
          tới vài phút.
        </p>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
          Nếu sau vài phút số dư chưa cập nhật, vui lòng liên hệ hỗ trợ kèm mã giao dịch (xem{' '}
          <Link href="/legal/contact" className="font-semibold text-[#6A48D6] hover:underline">
            trang Liên hệ
          </Link>
          ).
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/account"
            className="rounded-[12px] bg-[#7C5CE6] px-5 py-2.5 text-[14px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(124,92,230,0.5)] transition hover:bg-[#6A48D6]"
          >
            Kiểm tra ví →
          </Link>
          <Link
            href="/products"
            className="rounded-[12px] border border-[#E8E2F0] bg-white px-5 py-2.5 text-[14px] font-bold text-[#3D3654] transition hover:border-[#CCC3DC]"
          >
            Xem bộ đề
          </Link>
        </div>
      </div>
    </div>
  )
}
