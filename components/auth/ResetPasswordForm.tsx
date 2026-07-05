'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthCard, PasswordField, PrimaryButton } from '@/components/auth/fields'
import { StrengthMeter } from '@/components/auth/StrengthMeter'
import { passwordLevel, WEAK_PASSWORD_ERROR } from '@/lib/auth/password'
import { LockIcon, CheckIcon } from '@/components/brand/icons'

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const level = passwordLevel(password)

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
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/login')
  }

  return (
    <div className="flex flex-col items-center">
      <AuthCard>
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Đặt mật khẩu mới</h2>
        <p className="mt-1.5 text-[14px] font-semibold text-[#857F96]">
          Chọn mật khẩu mạnh mà bạn dễ nhớ. Mở trang này từ liên kết trong email.
        </p>

        <form onSubmit={onSubmit} className="mt-[22px]">
          <PasswordField
            label="Mật khẩu mới"
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

          {error && <p className="mt-3.5 text-[13.5px] font-semibold text-[#EF5B5B]">{error}</p>}

          <PrimaryButton type="submit" disabled={loading} className="mt-[22px]">
            {loading ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
          </PrimaryButton>
        </form>
      </AuthCard>
    </div>
  )
}
