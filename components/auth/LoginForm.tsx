'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'
import { AuthCard, AuthField, FieldLabel, PasswordField, PrimaryButton } from '@/components/auth/fields'
import { MailIcon, LockIcon } from '@/components/brand/icons'

// `next` đã được sanitize ở server (login page) — path nội bộ an toàn, mặc định '/'.
// `reason` server đã lọc whitelist ('idle' = bị đăng xuất do treo máy quá lâu — IdleLogout 2026-07-13).
export function LoginForm({ next = '/', reason }: { next?: string; reason?: 'idle' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(next) // quay lại trang đích (vd /exam/[id]) sau khi đăng nhập
    router.refresh()
  }

  return (
    <div className="flex flex-col items-center">
      <AuthCard>
        <h2 className="text-[23px] font-extrabold tracking-[-0.02em]">Chào mừng trở lại</h2>
        <p className="mt-1.5 text-[14px] font-semibold text-[#857F96]">
          Đăng nhập để tiếp tục hành trình luyện band.
        </p>

        {reason === 'idle' && (
          <p className="mt-3 rounded-[10px] border border-[#F1E4C8] bg-[#FFFBF2] px-3 py-2.5 text-[13px] font-semibold leading-[1.5] text-[#8A6A1F]">
            Bạn đã được đăng xuất do không hoạt động trong thời gian dài. Đăng nhập lại để tiếp tục.
          </p>
        )}

        <div className="mt-[22px]">
          <GoogleAuthButton next={next} />
        </div>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#EDE8F3]" />
          <span className="text-[12px] font-bold text-[#B0A9C0]">hoặc</span>
          <span className="h-px flex-1 bg-[#EDE8F3]" />
        </div>

        <form onSubmit={onSubmit}>
          <AuthField
            label="Email"
            type="email"
            required
            icon={<MailIcon />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordField
            className="mt-4"
            labelRow={
              <div className="mb-[7px] flex items-center justify-between">
                <FieldLabel>Mật khẩu</FieldLabel>
                <Link href="/forgot-password" className="text-[12.5px] font-bold text-[#6A48D6]">
                  Quên mật khẩu?
                </Link>
              </div>
            }
            required
            icon={<LockIcon />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="mt-3.5 text-[13.5px] font-semibold text-[#EF5B5B]">{error}</p>}

          <PrimaryButton type="submit" disabled={loading} className="mt-[22px]">
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </PrimaryButton>
        </form>
      </AuthCard>

      <p className="mt-5 text-[13.5px] font-semibold text-[#857F96]">
        Chưa có tài khoản?{' '}
        <Link href="/register" className="font-bold text-[#6A48D6]">
          Đăng ký miễn phí →
        </Link>
      </p>
    </div>
  )
}
