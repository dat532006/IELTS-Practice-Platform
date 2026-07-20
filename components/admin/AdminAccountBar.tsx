'use client'

import Link from 'next/link'
import { useState } from 'react'
import { performLogout } from '@/lib/auth/logout'

// Thanh tài khoản admin (góc phải header khu quản trị, 2026-07-12).
//   Email đang đăng nhập → link tới hồ sơ chi tiết của CHÍNH tài khoản này trong /admin/users
//   (ví/giao dịch/lịch sử làm bài). Đăng xuất: performLogout (SEC-002 checked signOut + local fallback +
//   invalidateHeaderProfile — bài học PR #23: header public cache email/coin) → về /login.
export function AdminAccountBar({ email, userId }: { email: string | null; userId: string }) {
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      await performLogout()
      window.location.href = '/login'
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
      <Link
        href={`/admin/users/${userId}`}
        title="Xem hồ sơ tài khoản admin này (ví, giao dịch, lịch sử)"
        className="flex min-h-[44px] min-w-0 max-w-[220px] items-center truncate rounded-[9px] px-2.5 text-[12.5px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[#F2EFF7] hover:text-[#2A2740]"
      >
        {email ?? 'Tài khoản admin'}
      </Link>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="min-h-[44px] rounded-[9px] border border-[#E4DEEE] bg-white px-3 text-[12.5px] font-bold text-[#564F6B] transition-colors hover:border-[#CCC3DC] hover:bg-[#F8F6FC] disabled:opacity-50"
      >
        {busy ? 'Đang thoát…' : 'Đăng xuất'}
      </button>
    </div>
  )
}
