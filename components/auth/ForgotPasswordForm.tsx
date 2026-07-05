'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard, AuthField, PrimaryButton } from '@/components/auth/fields'
import { MailIcon, KeyIcon } from '@/components/brand/icons'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Recovery dùng PKCE: phải qua /auth/callback để exchangeCodeForSession trước,
      // rồi mới tới /reset-password (lúc này đã có recovery session để updateUser).
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center">
        <AuthCard className="text-center">
          <span className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-[#E7F7EE] text-[#1E9E63]">
            <MailIcon size={28} />
          </span>
          <h2 className="mt-[18px] text-[22px] font-extrabold tracking-[-0.02em]">Đã gửi liên kết</h2>
          <p className="mx-auto mt-2 max-w-[30ch] text-[14px] font-semibold leading-[1.55] text-[#857F96]">
            Nếu email tồn tại, bạn sẽ nhận liên kết đặt lại mật khẩu.
          </p>
        </AuthCard>
        <Link href="/login" className="mt-5 text-[13.5px] font-bold text-[#857F96] transition hover:text-[#6A48D6]">
          <span className="text-[#6A48D6]">←</span> Về đăng nhập
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <AuthCard className="text-center">
        <span className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-[#F0ECFF] text-[#7C5CE6]">
          <KeyIcon size={30} />
        </span>
        <h2 className="mt-[18px] text-[22px] font-extrabold tracking-[-0.02em]">Quên mật khẩu?</h2>
        <p className="mx-auto mt-2 max-w-[30ch] text-[14px] font-semibold leading-[1.55] text-[#857F96]">
          Nhập email và chúng tôi sẽ gửi liên kết đặt lại an toàn.
        </p>

        <form onSubmit={onSubmit} className="mt-[22px] text-left">
          <AuthField
            label="Email"
            type="email"
            required
            icon={<MailIcon />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="mt-3 text-[13.5px] font-semibold text-[#EF5B5B]">{error}</p>}
          <PrimaryButton type="submit" disabled={loading} className="mt-5">
            {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại'}
          </PrimaryButton>
        </form>
      </AuthCard>
      <Link href="/login" className="mt-5 text-[13.5px] font-bold text-[#857F96] transition hover:text-[#6A48D6]">
        <span className="text-[#6A48D6]">←</span> Về đăng nhập
      </Link>
    </div>
  )
}
