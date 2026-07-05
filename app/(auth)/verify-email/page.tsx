import Link from 'next/link'
import { AuthCard } from '@/components/auth/fields'
import { MailIcon, CheckIcon } from '@/components/brand/icons'

export default function VerifyEmailPage() {
  return (
    <div className="flex flex-col items-center">
      <AuthCard className="text-center">
        <span
          className="relative inline-flex h-[66px] w-[66px] items-center justify-center rounded-[20px] text-[#7C5CE6]"
          style={{ background: 'linear-gradient(150deg,#F0ECFF,#E3DBFF)' }}
        >
          <MailIcon size={32} />
          <span className="absolute -bottom-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border-[3px] border-white bg-[#1E9E63] text-white">
            <CheckIcon size={12} strokeWidth={3.6} />
          </span>
        </span>
        <h2 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em]">Kiểm tra hộp thư</h2>
        <p className="mx-auto mt-2 max-w-[32ch] text-[14.5px] font-semibold leading-[1.6] text-[#857F96]">
          Chúng tôi đã gửi email xác nhận. Mở email và làm theo hướng dẫn để kích hoạt tài khoản.
        </p>

        <div className="mt-[22px] rounded-[14px] border border-dashed border-[#DDD3F2] bg-[#FAF8FF] px-4 py-3.5 text-left text-[13px] font-semibold leading-[1.55] text-[#564F6B]">
          <span className="font-extrabold text-[#6A48D6]">Mẹo · </span>
          Nếu chưa thấy sau vài phút, hãy kiểm tra hộp thư spam.
        </div>

        <Link
          href="/login"
          className="mt-5 flex w-full items-center justify-center rounded-[13px] bg-[#7C5CE6] p-[14px] text-[15px] font-bold text-white shadow-[0_14px_28px_-8px_rgba(124,92,230,0.55)] transition hover:bg-[#6A48D6]"
        >
          Về đăng nhập
        </Link>
      </AuthCard>
      <p className="mt-[18px] text-[13.5px] font-semibold text-[#857F96]">
        Nhầm địa chỉ?{' '}
        <Link href="/register" className="font-bold text-[#6A48D6]">
          Đăng ký lại
        </Link>
      </p>
    </div>
  )
}
