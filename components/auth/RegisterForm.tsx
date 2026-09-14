'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'
import { AuthCard, AuthField, AuthMessage, PasswordField, PrimaryButton } from '@/components/auth/fields'
import { StrengthMeter } from '@/components/auth/StrengthMeter'
import { passwordLevel, WEAK_PASSWORD_ERROR } from '@/lib/auth/password'
import { MailIcon, LockIcon, UserIcon, CheckIcon } from '@/components/brand/icons'
import { LEGAL_SLUG } from '@/lib/legal'
import { toAuthErrorMessage } from '@/lib/auth/error-message'

const OTP_INPUT =
  'w-full rounded-[12px] border border-[#E8E2F0] bg-white px-3.5 py-[13px] text-center text-[18px] font-bold tracking-[0.5em] text-[#2A2740] outline-none shadow-[0_4px_12px_rgba(42,39,64,0.04)] focus:border-[#7C5CE6]'

export function RegisterForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [otp, setOtp] = useState('')
  const [phase, setPhase] = useState<'form' | 'otp'>('form')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const level = passwordLevel(password)

  // Lưu tên vào profiles.name (best-effort) khi đã có session — RLS cho phép cập nhật name.
  async function saveName(supabase: ReturnType<typeof createClient>) {
    if (!name.trim()) return
    const { data } = await supabase.auth.getUser()
    if (data.user) await supabase.from('profiles').update({ name: name.trim() }).eq('id', data.user.id)
  }

  function showError(message: string, fieldId: string) {
    setError(message)
    window.requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const normalizedEmail = email.trim()
    if (!name.trim()) {
      showError('Vui lòng nhập họ và tên.', 'register-name')
      return
    }
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      showError('Vui lòng nhập địa chỉ email hợp lệ.', 'register-email')
      return
    }
    if (level < 1) {
      showError(WEAK_PASSWORD_ERROR, 'register-password')
      return
    }
    if (password !== confirm) {
      showError('Mật khẩu nhập lại không khớp.', 'register-confirm')
      return
    }
    if (!agree) {
      showError('Vui lòng đồng ý với Điều khoản và Chính sách bảo mật.', 'register-agree')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
          data: { full_name: name.trim(), name: name.trim() },
        },
      })
      if (authError) {
        showError(toAuthErrorMessage(authError, 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.'), 'register-email')
        return
      }
      if (data.session) {
        await saveName(supabase)
        router.push('/')
        router.refresh()
        return
      }
      setPhase('otp')
    } catch (authError) {
      showError(toAuthErrorMessage(authError, 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.'), 'register-email')
    } finally {
      setLoading(false)
    }
  }
  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // ĐỘ DÀI MÃ DO SUPABASE QUYẾT (mailer_otp_length ở dashboard, hợp lệ 6–10), KHÔNG phải do code này.
    //   Trước đây hard-code đúng 6 + maxLength={6}: prod đặt 8 → mail gửi 8 số mà ô nhập cắt còn 6 →
    //   không ai đăng ký được (Owner báo 2026-07-30). Nhận cả dải 6–10 để lệch cấu hình không chặn đăng ký.
    if (!/^\d{6,10}$/.test(otp.trim())) {
      showError('Mã xác nhận chỉ gồm chữ số — nhập đúng dãy số trong email.', 'register-otp')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.verifyOtp({ email, token: otp.trim(), type: 'signup' })
      if (authError) {
        showError(toAuthErrorMessage(authError, 'Không thể xác nhận email lúc này. Vui lòng thử lại.'), 'register-otp')
        return
      }
      await saveName(supabase)
      router.push('/')
      router.refresh()
    } catch (authError) {
      showError(toAuthErrorMessage(authError, 'Không thể xác nhận email lúc này. Vui lòng thử lại.'), 'register-otp')
    } finally {
      setLoading(false)
    }
  }
  async function resend() {
    setError(null)
    setNotice(null)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.resend({ type: 'signup', email })
      if (authError) {
        showError(toAuthErrorMessage(authError, 'Không thể gửi lại mã lúc này. Vui lòng thử lại.'), 'register-otp')
        return
      }
      setNotice('Đã gửi lại mã xác nhận.')
    } catch (authError) {
      showError(toAuthErrorMessage(authError, 'Không thể gửi lại mã lúc này. Vui lòng thử lại.'), 'register-otp')
    }
  }

  if (phase === 'otp') {
    return (
      <div className="flex flex-col items-center">
        <AuthCard>
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Xác nhận email</h1>
          <p className="mt-2 text-[14px] font-semibold text-[var(--text-muted)]">
            Đã gửi mã xác nhận tới <span className="font-extrabold text-[#2A2740]">{email}</span>.
            Nhập mã trong email để hoàn tất đăng ký.
          </p>
          <form onSubmit={onVerify} noValidate className="mt-5">
            <label htmlFor="register-otp" className="mb-2 block text-[13px] font-bold text-[#4A445E]">Mã xác nhận trong email</label>
            <input
              id="register-otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
              aria-invalid={!!error || undefined}
              aria-describedby={error ? 'register-otp-error' : notice ? 'register-otp-notice' : undefined}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className={OTP_INPUT}
              placeholder="••••••"
            />
            {error && <AuthMessage id="register-otp-error">{error}</AuthMessage>}
            {notice && <AuthMessage id="register-otp-notice" tone="success">{notice}</AuthMessage>}
            <PrimaryButton type="submit" disabled={loading || otp.length < 6} className="mt-4">
              {loading ? 'Đang xác nhận…' : 'Xác nhận'}
            </PrimaryButton>
          </form>
          <div className="mt-4 flex justify-between text-[12.5px] font-bold text-[var(--text-muted)]">
            <button type="button" onClick={resend} className="min-h-[44px] rounded-[8px] px-1 transition-colors hover:text-[#5B43C7]">
              Gửi lại mã
            </button>
            <button type="button" onClick={() => setPhase('form')} className="min-h-[44px] rounded-[8px] px-1 transition-colors hover:text-[#5B43C7]">
              Đổi email
            </button>
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <AuthCard>
        <h1 className="text-[23px] font-extrabold tracking-[-0.02em]">Tạo tài khoản</h1>
        <p className="mt-1.5 text-[14px] font-semibold text-[var(--text-muted)]">
          Bắt đầu với các đề miễn phí — không cần thẻ.
        </p>

        <div className="mt-[22px]">
          <GoogleAuthButton label="Đăng ký với Google" />
        </div>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-[#EDE8F3]" />
          <span className="text-[12px] font-bold text-[var(--text-subtle)]">hoặc</span>
          <span className="h-px flex-1 bg-[#EDE8F3]" />
        </div>

        <form onSubmit={onSubmit} noValidate>
          <AuthField
            id="register-name"
            name="name"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'register-error' : undefined}
            label="Họ và tên"
            type="text"
            required
            icon={<UserIcon />}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <AuthField
            id="register-email"
            name="email"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'register-error' : undefined}
            className="mt-[15px]"
            label="Email"
            type="email"
            required
            icon={<MailIcon />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            id="register-password"
            name="password"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'register-error' : undefined}
            className="mt-[15px]"
            label="Mật khẩu"
            required
            minLength={6}
            icon={<LockIcon />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <StrengthMeter level={level} />

          <PasswordField
            id="register-confirm"
            name="password-confirmation"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'register-error' : undefined}
            className="mt-[15px]"
            label="Xác nhận mật khẩu"
            required
            icon={<LockIcon />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            rightAdornment={
              confirm.length > 0 && confirm === password ? (
                <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#E7F7EE] text-[var(--text-success)]">
                  <CheckIcon size={11} strokeWidth={3.4} />
                </span>
              ) : undefined
            }
          />

          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
              id="register-agree"
              name="agree"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? 'register-error' : undefined}
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="peer sr-only"
            />
            <span className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border border-[#D9D2E6] bg-white text-transparent transition peer-checked:border-[#7C5CE6] peer-checked:bg-[#7C5CE6] peer-checked:text-white">
              <CheckIcon size={11} strokeWidth={3.4} />
            </span>
            <span className="text-[12.5px] font-semibold leading-[1.5] text-[#6A6480]">
              Tôi đồng ý với{' '}
              <Link href={'/legal/' + LEGAL_SLUG.TRANSACTION_TERMS} className="font-bold text-[#6A48D6]">
                Điều khoản
              </Link>{' '}
              &amp;{' '}
              <Link href={'/legal/' + LEGAL_SLUG.PRIVACY} className="font-bold text-[#6A48D6]">
                Chính sách bảo mật
              </Link>
              .
            </span>
          </label>

          {error && <AuthMessage id="register-error">{error}</AuthMessage>}

          <PrimaryButton type="submit" disabled={loading} className="mt-5">
            {loading ? 'Đang tạo…' : 'Đăng ký miễn phí'}
          </PrimaryButton>
        </form>
      </AuthCard>

      <p className="mt-5 text-[13.5px] font-semibold text-[var(--text-muted)]">
        Đã có tài khoản?{' '}
        <Link href="/login" className="font-bold text-[#6A48D6]">
          Đăng nhập →
        </Link>
      </p>
    </div>
  )
}
