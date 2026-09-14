'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'
import { AuthCard, AuthField, AuthMessage, FieldLabel, PasswordField, PrimaryButton } from '@/components/auth/fields'
import { MailIcon, LockIcon } from '@/components/brand/icons'
import { toAuthErrorMessage } from '@/lib/auth/error-message'

export function LoginForm({ next = '/', reason }: { next?: string; reason?: 'idle' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<'email' | 'password' | 'credentials' | null>(null)
  const [loading, setLoading] = useState(false)

  function focusField(id: 'login-email' | 'login-password') {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setInvalidField(null)

    const normalizedEmail = email.trim()
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.')
      setInvalidField('email')
      focusField('login-email')
      return
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.')
      setInvalidField('password')
      focusField('login-password')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (authError) {
        setError(toAuthErrorMessage(authError, 'Không thể đăng nhập lúc này. Vui lòng thử lại.'))
        setInvalidField('credentials')
        focusField('login-email')
        return
      }
      router.push(next)
      router.refresh()
    } catch (authError) {
      setError(toAuthErrorMessage(authError, 'Không thể đăng nhập lúc này. Vui lòng thử lại.'))
      focusField('login-email')
    } finally {
      setLoading(false)
    }
  }

  const emailInvalid = invalidField === 'email' || invalidField === 'credentials'
  const passwordInvalid = invalidField === 'password' || invalidField === 'credentials'

  return (
    <div className="flex flex-col items-center">
      <AuthCard>
        <h1 className="text-[23px] font-extrabold tracking-[-0.02em]">Chào mừng trở lại</h1>
        <p className="mt-1.5 text-[14px] font-semibold text-[var(--text-muted)]">
          Đăng nhập để tiếp tục hành trình luyện band.
        </p>

        {reason === 'idle' && (
          <p role="status" className="mt-3 rounded-[10px] border border-[#F1E4C8] bg-[#FFFBF2] px-3 py-2.5 text-[13px] font-semibold leading-[1.5] text-[#8A6A1F]">
            Bạn đã được đăng xuất do không hoạt động trong thời gian dài. Đăng nhập lại để tiếp tục.
          </p>
        )}

        <div className="mt-[22px]">
          <GoogleAuthButton next={next} />
        </div>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-[#EDE8F3]" />
          <span className="text-[12px] font-bold text-[var(--text-subtle)]">hoặc</span>
          <span className="h-px flex-1 bg-[#EDE8F3]" />
        </div>

        <form onSubmit={onSubmit} noValidate>
          <AuthField
            id="login-email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid ? 'login-error' : undefined}
            icon={<MailIcon />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <PasswordField
            id="login-password"
            name="password"
            className="mt-4"
            labelRow={(id) => (
              <div className="mb-[7px] flex items-center justify-between">
                <FieldLabel htmlFor={id}>Mật khẩu</FieldLabel>
                <Link href="/forgot-password" className="-my-1 inline-block py-1 text-[12.5px] font-bold text-[#5B43C7]">
                  Quên mật khẩu?
                </Link>
              </div>
            )}
            autoComplete="current-password"
            required
            aria-invalid={passwordInvalid || undefined}
            aria-describedby={passwordInvalid ? 'login-error' : undefined}
            icon={<LockIcon />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && <AuthMessage id="login-error">{error}</AuthMessage>}

          <PrimaryButton type="submit" disabled={loading} aria-busy={loading} className="mt-[22px]">
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </PrimaryButton>
        </form>
      </AuthCard>

      <p className="mt-5 text-[13.5px] font-semibold text-[var(--text-muted)]">
        Chưa có tài khoản?{' '}
        <Link href="/register" className="font-bold text-[#5B43C7]">
          Đăng ký miễn phí →
        </Link>
      </p>
    </div>
  )
}