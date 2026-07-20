'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard, AuthField, AuthMessage, PrimaryButton } from '@/components/auth/fields'
import { MailIcon, KeyIcon } from '@/components/brand/icons'
import { toAuthErrorMessage } from '@/lib/auth/error-message'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.')
      window.requestAnimationFrame(() => document.getElementById('forgot-email')?.focus())
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: window.location.origin + '/auth/callback?next=/reset-password',
      })
      if (authError) {
        setError(toAuthErrorMessage(authError, 'Không thể gửi liên kết lúc này. Vui lòng thử lại.'))
        window.requestAnimationFrame(() => document.getElementById('forgot-email')?.focus())
        return
      }
      setSent(true)
    } catch (authError) {
      setError(toAuthErrorMessage(authError, 'Không thể gửi liên kết lúc này. Vui lòng thử lại.'))
      window.requestAnimationFrame(() => document.getElementById('forgot-email')?.focus())
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center">
        <AuthCard className="text-center">
          <span className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-[#E7F7EE] text-[var(--text-success)]">
            <MailIcon size={28} />
          </span>
          <h1 className="mt-[18px] text-[22px] font-extrabold tracking-[-0.02em]">Đã gửi liên kết</h1>
          <p role="status" className="mx-auto mt-2 max-w-[30ch] text-[14px] font-semibold leading-[1.55] text-[var(--text-muted)]">
            Nếu email tồn tại, bạn sẽ nhận liên kết đặt lại mật khẩu.
          </p>
        </AuthCard>
        <Link href="/login" className="mt-5 flex min-h-[44px] items-center text-[13.5px] font-bold text-[var(--text-muted)] transition-colors hover:text-[#5B43C7]">
          <span className="text-[#5B43C7]">←</span>&nbsp;Về đăng nhập
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
        <h1 className="mt-[18px] text-[22px] font-extrabold tracking-[-0.02em]">Quên mật khẩu?</h1>
        <p className="mx-auto mt-2 max-w-[30ch] text-[14px] font-semibold leading-[1.55] text-[var(--text-muted)]">
          Nhập email và chúng tôi sẽ gửi liên kết đặt lại an toàn.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-[22px] text-left">
          <AuthField
            id="forgot-email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'forgot-error' : undefined}
            icon={<MailIcon />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error && <AuthMessage id="forgot-error">{error}</AuthMessage>}
          <PrimaryButton type="submit" disabled={loading} aria-busy={loading} className="mt-5">
            {loading ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
          </PrimaryButton>
        </form>
      </AuthCard>
      <Link href="/login" className="mt-5 flex min-h-[44px] items-center text-[13.5px] font-bold text-[var(--text-muted)] transition-colors hover:text-[#5B43C7]">
        <span className="text-[#5B43C7]">←</span>&nbsp;Về đăng nhập
      </Link>
    </div>
  )
}