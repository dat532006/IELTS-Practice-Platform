import Link from 'next/link'

export default function VerifyEmailPage() {
  return (
    <div>
      <h1 className="text-lg font-bold">Xác nhận email</h1>
      <p className="mt-3 text-sm text-slate-600">
        Vui lòng mở email và bấm liên kết xác nhận để kích hoạt tài khoản.
      </p>
      <Link href="/login" className="mt-4 inline-block text-sm text-teal-700 hover:underline">
        Về đăng nhập
      </Link>
    </div>
  )
}
