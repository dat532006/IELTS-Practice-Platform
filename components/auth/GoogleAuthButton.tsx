'use client'

import { createClient } from '@/lib/supabase/client'
import { GoogleGIcon } from '@/components/brand/icons'

// Nút đăng nhập/đăng ký bằng Google — dùng chung cho /login và /register.
// `next` đã được sanitize ở server; callback (`/auth/callback`) re-sanitize lần nữa (chống open-redirect).
export function GoogleAuthButton({
  next = '/',
  label = 'Tiếp tục với Google',
}: {
  next?: string
  label?: string
}) {
  async function google() {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  }

  return (
    <button
      type="button"
      onClick={google}
      className="flex w-full items-center justify-center gap-2.5 rounded-[12px] border border-[#E8E2F0] bg-white p-3 text-[14px] font-bold text-[#2A2740] shadow-[0_4px_12px_rgba(42,39,64,0.04)] transition hover:bg-[#FBFAFF]"
    >
      <GoogleGIcon size={18} />
      {label}
    </button>
  )
}
