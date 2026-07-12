'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { invalidateHeaderProfile } from '@/lib/auth/client-profile'

// Thanh tài khoản admin (góc phải header khu quản trị, 2026-07-12).
//   Email đang đăng nhập → link tới hồ sơ chi tiết của CHÍNH tài khoản này trong /admin/users
//   (ví/giao dịch/lịch sử làm bài). Đăng xuất: signOut + invalidateHeaderProfile (bài học PR #23 —
//   header public cache email/coin, không gọi sẽ hiện user cũ) → về /login.
export function AdminAccountBar({ email, userId }: { email: string | null; userId: string }) {
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      invalidateHeaderProfile()
      window.location.href = '/login'
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2.5">
      <Link
        href={`/admin/users/${userId}`}
        title="Xem hồ sơ tài khoản admin này (ví, giao dịch, lịch sử)"
        className="hidden max-w-[220px] truncate rounded-[9px] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#6A6480] transition hover:bg-[#F2EFF7] hover:text-[#2A2740] sm:block"
      >
        {email ?? 'Tài khoản admin'}
      </Link>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="rounded-[9px] border border-[#E4DEEE] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#564F6B] transition hover:border-[#CCC3DC] hover:bg-[#F8F6FC] disabled:opacity-50"
      >
        {busy ? 'Đang thoát…' : 'Đăng xuất'}
      </button>
    </div>
  )
}
