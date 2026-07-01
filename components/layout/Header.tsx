'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MAIN_NAV } from '@/lib/nav'

export function Header() {
  const [email, setEmail] = useState<string | null>(null)
  const [coins, setCoins] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active || !data.user) return
        setEmail(data.user.email ?? null)
        const { data: profile } = await supabase
          .from('profiles')
          .select('coins')
          .eq('id', data.user.id)
          .single()
        if (active) setCoins(profile?.coins ?? 0)
      })
      .catch(() => {
        /* chưa đăng nhập / chưa cấu hình env — render trạng thái logged-out */
      })
    return () => {
      active = false
    }
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(42,39,64,0.07)] bg-[rgba(251,249,255,0.8)] backdrop-blur-[12px] backdrop-saturate-[180%]">
      <div className="mx-auto flex h-[72px] w-[min(1200px,93vw)] items-center gap-6">
        <Link
          href="/"
          className="flex flex-none items-center gap-2.5 text-[20px] font-extrabold tracking-[-0.02em] text-[#2A2740]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#7C5CE6] shadow-[0_6px_16px_rgba(124,92,230,0.34)]">
            <span className="block h-[13px] w-[13px] rotate-45 rounded-[4px] bg-white" />
          </span>
          <span>
            <span className="text-[#7C5CE6]">IELTS</span>Practice
          </span>
        </Link>

        <nav className="hidden flex-1 items-center gap-[22px] md:flex">
          {MAIN_NAV.map((item) =>
            item.comingSoon ? (
              <span
                key={item.label}
                title="Coming soon — ngoài scope v1"
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-1.5 text-[14.5px] font-semibold text-[#A8A2BA]"
              >
                {item.label}
                <span className="rounded-[5px] bg-[#EFEBF4] px-[5px] py-0.5 text-[9px] font-extrabold uppercase text-[#9D96AE]">
                  soon
                </span>
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="text-[14.5px] font-semibold text-[#564F6B] transition hover:text-[#7C5CE6]"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-3.5">
          {email ? (
            <>
              <Link
                href="/dashboard"
                className="hidden text-[14.5px] font-bold text-[#2A2740] transition hover:text-[#7C5CE6] sm:inline"
              >
                Bảng điều khiển
              </Link>
              <span className="text-[14.5px] font-semibold text-[#564F6B]" title="Số dư coin">
                🪙 {coins ?? '—'}
              </span>
              <span className="hidden max-w-[12rem] truncate text-[14.5px] text-[#857F96] sm:inline">{email}</span>
              <button
                onClick={logout}
                className="text-[14.5px] font-bold text-[#2A2740] transition hover:text-[#7C5CE6]"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-[14.5px] font-bold text-[#2A2740] transition hover:text-[#7C5CE6]">
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-[11px] bg-[#7C5CE6] px-[18px] py-2.5 text-[14.5px] font-bold text-white shadow-[0_8px_20px_rgba(124,92,230,0.26)] transition hover:bg-[#6A48D6]"
              >
                Thi thử ngay
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
