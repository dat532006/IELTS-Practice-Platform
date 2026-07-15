'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getHeaderProfile, invalidateHeaderProfile, subscribeHeaderProfile } from '@/lib/auth/client-profile'
import { performLogout } from '@/lib/auth/logout'
import { MAIN_NAV } from '@/lib/nav'
import { Logo } from '@/components/brand/Logo'
import { FishBone } from '@/components/brand/FishBone'
import { AccountAvatar } from '@/components/account/AccountAvatar'

export function Header() {
  const [email, setEmail] = useState<string | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false) // UI-004: mobile nav (md:hidden)

  // UI-004: Escape đóng mobile menu (bàn phím). Chỉ gắn listener khi đang mở.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    let active = true
    const apply = (p: { email: string | null; coins: number | null; avatar: string | null }) => {
      if (!active) return
      setEmail(p.email)
      setCoins(p.coins)
      setAvatar(p.avatar)
    }
    // Cached promise (lib/auth/client-profile): remount giữa landing ↔ marketing không refetch.
    const reload = () => void getHeaderProfile().then(apply)
    reload()
    // UI-002 — cập nhật KHÔNG cần reload: bus invalidate (login/logout/mua hàng/avatar, trong tab hoặc
    //   cross-tab) → subscribe refetch; onAuthStateChange trong tab → invalidate (drop cache + báo tab khác).
    const unsub = subscribeHeaderProfile(reload)
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') invalidateHeaderProfile()
    })
    return () => {
      active = false
      unsub()
      sub.subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    // SEC-002 — checked signOut + local fallback (helper) TRƯỚC khi điều hướng → không kẹt cookie/loop.
    await performLogout()
    window.location.href = '/'
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(42,39,64,0.07)] bg-[rgba(251,249,255,0.8)] backdrop-blur-[12px] backdrop-saturate-[180%]">
      <div className="mx-auto flex h-[72px] w-[min(1200px,93vw)] items-center gap-6">
        <Logo href="/" size={38} textClassName="text-[17px]" withShadow={false} />

        <nav className="hidden flex-1 items-center gap-[22px] md:flex">
          {MAIN_NAV.map((item) =>
            item.comingSoon ? (
              <span
                key={item.label}
                title="Coming soon — ngoài scope v1"
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-1.5 text-[14px] font-bold text-[#A8A2BA]"
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
                className="text-[14px] font-bold text-[#564F6B] transition hover:text-[#7C5CE6]"
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
                className="hidden text-[14px] font-bold text-[#2A2740] transition hover:text-[#7C5CE6] sm:inline"
              >
                Dashboard
              </Link>
              <span
                title="Số dư xương cá"
                className="flex items-center gap-2 rounded-full border border-[#EDE7F5] bg-white px-3.5 py-1.5 text-[13.5px] font-extrabold text-[#2A2740] shadow-[0_4px_12px_rgba(42,39,64,0.05)]"
              >
                <FishBone /> {coins ?? '—'}
              </span>
              <button
                onClick={logout}
                className="text-[14px] font-bold text-[#2A2740] transition hover:text-[#7C5CE6]"
              >
                Log out
              </button>
              <Link
                href="/account"
                aria-label="Tài khoản"
                title="Tài khoản"
                className="flex flex-none overflow-hidden rounded-[11px] shadow-[0_6px_14px_-4px_rgba(124,92,230,0.6)] transition hover:opacity-90"
              >
                <AccountAvatar name={email} email={email} avatar={avatar} size={36} radius={11} fontSize={15} />
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-[14px] font-bold text-[#2A2740] transition hover:text-[#7C5CE6]">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-[11px] bg-[#7C5CE6] px-[18px] py-2.5 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(124,92,230,0.26)] transition hover:bg-[#6A48D6]"
              >
                Start free
              </Link>
            </>
          )}

          {/* UI-004: hamburger mở nav chính trên mobile (nav desktop bị ẩn dưới md) */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="flex flex-none items-center justify-center rounded-[10px] border border-[#EDE7F5] bg-white p-2 text-[#2A2740] shadow-[0_4px_12px_rgba(42,39,64,0.05)] md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </div>
      </div>

      {/* UI-004: panel nav mobile — chứa MAIN_NAV (+ Dashboard khi đăng nhập) để route không mất trên <768px */}
      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-[rgba(42,39,64,0.07)] bg-[rgba(251,249,255,0.98)] px-[3.5vw] py-3 md:hidden">
          <ul className="flex flex-col gap-0.5">
            {email && (
              <li>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block rounded-[10px] px-3 py-2.5 text-[15px] font-bold text-[#2A2740] hover:bg-[#F0ECFF]">
                  Dashboard
                </Link>
              </li>
            )}
            {MAIN_NAV.map((item) =>
              item.comingSoon ? (
                <li key={item.label}>
                  <span aria-disabled="true" className="flex items-center gap-1.5 px-3 py-2.5 text-[15px] font-bold text-[#A8A2BA]">
                    {item.label}
                    <span className="rounded-[5px] bg-[#EFEBF4] px-[5px] py-0.5 text-[9px] font-extrabold uppercase text-[#9D96AE]">soon</span>
                  </span>
                </li>
              ) : (
                <li key={item.label}>
                  <Link href={item.href} onClick={() => setMenuOpen(false)} className="block rounded-[10px] px-3 py-2.5 text-[15px] font-bold text-[#564F6B] hover:bg-[#F0ECFF] hover:text-[#7C5CE6]">
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      )}
    </header>
  )
}
