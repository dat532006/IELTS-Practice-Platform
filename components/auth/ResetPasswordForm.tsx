'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthCard, AuthMessage, PasswordField, PrimaryButton } from '@/components/auth/fields'
import { StrengthMeter } from '@/components/auth/StrengthMeter'
import { passwordLevel, WEAK_PASSWORD_ERROR } from '@/lib/auth/password'
import { LockIcon, CheckIcon } from '@/components/brand/icons'
import { toAuthErrorMessage } from '@/lib/auth/error-message'

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<'password' | 'confirm' | 'global' | null>(null)
  const [loading, setLoading] = useState(false)
  const level = passwordLevel(password)

  function focusField(id: 'reset-password' | 'reset-confirm') {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setInvalidField(null)
    if (level < 1) {
      setError(WEAK_PASSWORD_ERROR)
      setInvalidField('password')
      focusField('reset-password')
      return
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.')
      setInvalidField('confirm')
      focusField('reset-confirm')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.updateUser({ password })
      if (authError) {
        setError(toAuthErrorMessage(authError, 'Không thể cập nhật mật khẩu lúc này. Vui lòng thử lại.'))
        setInvalidField('global')
        focusField('reset-password')
        return
      }
      router.push('/login')
    } catch (authError) {
      setError(toAuthErrorMessage(authError, 'Không thể cập nhật mật khẩu lúc này. Vui lòng thử lại.'))
      setInvalidField('global')
      focusField('reset-password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <AuthCard>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Đặt mật khẩu mới</h1>
        <p className="mt-1.5 text-[14px] font-semibold text-[var(--text-muted)]">
          Chọn mật khẩu mạnh mà bạn dễ nhớ. Mở trang này từ liên kết trong email.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-[22px]">
          <PasswordField
            id="reset-password"
            name="password"
            label="Mật khẩu mới"
            required
            minLength={6}
            autoComplete="new-password"
            aria-invalid={invalidField === 'password' || invalidField === 'global' || undefined}
            aria-describedby={error && invalidField !== 'confirm' ? 'reset-error' : undefined}
            icon={<LockIcon />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <StrengthMeter level={level} />

          <PasswordField
            id="reset-confirm"
            name="password-confirmation"
            className="mt-[15px]"
            label="Xác nhận mật khẩu"
            required
            autoComplete="new-password"
            aria-invalid={invalidField === 'confirm' || undefined}
            aria-describedby={invalidField === 'confirm' ? 'reset-error' : undefined}
            icon={<LockIcon />}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            rightAdornment={
              confirm.length > 0 && confirm === password ? (
                <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#E7F7EE] text-[var(--text-success)]">
                  <CheckIcon size={11} strokeWidth={3.4} />
                </span>
              ) : undefined
            }
          />

          {error && <AuthMessage id="reset-error">{error}</AuthMessage>}

          <PrimaryButton type="submit" disabled={loading} aria-busy={loading} className="mt-[22px]">
            {loading ? 'Đang lưu…' : 'Cập nhật mật khẩu'}
          </PrimaryButton>
        </form>
      </AuthCard>
    </div>
  )
}