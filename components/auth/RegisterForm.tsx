'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'
import { AuthCard, AuthField, PasswordField, PrimaryButton } from '@/components/auth/fields'
import { StrengthMeter } from '@/components/auth/StrengthMeter'
import { passwordLevel, WEAK_PASSWORD_ERROR } from '@/lib/auth/password'
import { MailIcon, LockIcon, UserIcon, CheckIcon } from '@/components/brand/icons'

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (level < 1) {
      setError(WEAK_PASSWORD_ERROR)
      return
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.')
      return
    }
    if (!agree) {
      setError('Vui lòng đồng ý với Điều khoản & Chính sách bảo mật.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: name.trim(), name: name.trim() },
      },
    })
    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }
    // Nếu project TẮT email confirmation, signUp trả về session luôn → vào thẳng.
    if (data.session) {
      await saveName(supabase)
      setLoading(false)
      router.push('/')
      router.refresh()
      return
    }
    setLoading(false)
    // Còn lại: cần xác nhận → chuyển sang bước nhập mã OTP gửi về email.
    setPhase('otp')
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: otp.trim(), type: 'signup' })
    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }
    await saveName(supabase)
    setLoading(false)
    router.push('/')
    router.refresh()
  }

  async function resend() {
    setError(null)
    setNotice(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) {
      setError(error.message)
      return
    }
    setNotice('Đã gửi lại mã xác nhận.')
  }

  if (phase === 'otp') {
    return (
      <div className="flex flex-col items-center">
        <AuthCard>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Xác nhận email</h2>
          <p className="mt-2 text-[14px] font-semibold text-[#857F96]">
            Đã gửi mã xác nhận tới <span className="font-extrabold text-[#2A2740]">{email}</span>.
            Nhập mã 6 số để hoàn tất đăng ký.
          </p>
          <form onSubmit={onVerify} className="mt-5">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className={OTP_INPUT}
              placeholder="••••••"
            />
            {error && <p className="mt-3 text-[13.5px] font-semibold text-[#EF5B5B]">{error}</p>}
            {notice && <p className="mt-3 text-[13.5px] font-semibold text-[#1E9E63]">{notice}</p>}
            <PrimaryButton type="submit" disabled={loading || otp.length < 6} className="mt-4">
              {loading ? 'Đang xác nhận...' : 'Xác nhận'}
            </PrimaryButton>
          </form>
          <div className="mt-4 flex justify-between text-[12.5px] font-bold text-[#857F96]">
            <button type="button" onClick={resend} className="transition hover:text-[#6A48D6]">
              Gửi lại mã
            </button>
            <button type="button" onClick={() => setPhase('form')} className="transition hover:text-[#6A48D6]">
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
        <h2 className="text-[23px] font-extrabold tracking-[-0.02em]">Tạo tài khoản</h2>
        <p className="mt-1.5 text-[14px] font-semibold text-[#857F96]">
          Bắt đầu với các đề miễn phí — không cần thẻ.
        </p>

        <div className="mt-[22px]">
          <GoogleAuthButton label="Đăng ký với Google" />
        </div>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#EDE8F3]" />
          <span className="text-[12px] font-bold text-[#B0A9C0]">hoặc</span>
          <span className="h-px flex-1 bg-[#EDE8F3]" />
        </div>

        <form onSubmit={onSubmit}>
          <AuthField
            label="Họ và tên"
            type="text"
            required
            icon={<UserIcon />}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <AuthField
            className="mt-[15px]"
            label="Email"
            type="email"
            required
            icon={<MailIcon />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
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
            className="mt-[15px]"
            label="Xác nhận mật khẩu"
            required
            icon={<LockIcon />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            rightAdornment={
              confirm.length > 0 && confirm === password ? (
                <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#E7F7EE] text-[#1E9E63]">
                  <CheckIcon size={11} strokeWidth={3.4} />
                </span>
              ) : undefined
            }
          />
          {confirm.length > 0 && confirm !== password && (
            <p className="mt-1.5 text-[12px] font-semibold text-[#EF5B5B]">Mật khẩu nhập lại không khớp.</p>
          )}

          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
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
              <Link href="/legal/terms" className="font-bold text-[#6A48D6]">
                Điều khoản
              </Link>{' '}
              &amp;{' '}
              <Link href="/legal/privacy" className="font-bold text-[#6A48D6]">
                Chính sách bảo mật
              </Link>
              .
            </span>
          </label>

          {error && <p className="mt-3.5 text-[13.5px] font-semibold text-[#EF5B5B]">{error}</p>}

          <PrimaryButton type="submit" disabled={loading} className="mt-5">
            {loading ? 'Đang tạo...' : 'Đăng ký miễn phí'}
          </PrimaryButton>
        </form>
      </AuthCard>

      <p className="mt-5 text-[13.5px] font-semibold text-[#857F96]">
        Đã có tài khoản?{' '}
        <Link href="/login" className="font-bold text-[#6A48D6]">
          Đăng nhập →
        </Link>
      </p>
    </div>
  )
}
