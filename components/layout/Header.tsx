'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getHeaderProfile, invalidateHeaderProfile, subscribeHeaderProfile } from '@/lib/auth/client-profile'
import { performLogout } from '@/lib/auth/logout'
import { MAIN_NAV } from '@/lib/nav'
import { Logo } from '@/components/brand/Logo'
import { FishBone } from '@/components/brand/FishBone'
import { AccountAvatar } from '@/components/account/AccountAvatar'
import { RouteNavLink } from '@/components/layout/RouteNavLink'
import { SkipLink } from '@/components/layout/SkipLink'

export function Header() {
  const [email, setEmail] = useState<string | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      window.requestAnimationFrame(() => toggleRef.current?.focus())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    let active = true
    const apply = (profile: { email: string | null; coins: number | null; avatar: string | null }) => {
      if (!active) return
      setEmail(profile.email)
      setCoins(profile.coins)
      setAvatar(profile.avatar)
    }
    const reload = () => void getHeaderProfile().then(apply)
    reload()
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
    await performLogout()
    window.location.href = '/'
  }

  const navItems = (mobile: boolean) =>
    MAIN_NAV.map((item) =>
      item.comingSoon ? (
        <span
          key={item.label}
          title="Sắp ra mắt — ngoài phạm vi v1"
          aria-disabled="true"
          className={
            mobile
              ? 'flex min-h-[44px] items-center gap-1.5 px-3 py-2.5 text-[15px] font-bold text-[var(--text-subtle)]'
              // Speaking = placeholder ngoài scope v1 (không bấm được). Ở tầng laptop nén (960–1279px)
              // ẩn đi để 7 mục điều hướng THẬT + cụm tài khoản vừa thanh 953px; ≥1280 hiện lại như cũ.
              // Menu hamburger (mobile) vẫn luôn có mục này nên không mất thông tin "sắp ra mắt".
              : 'hidden min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-[var(--text-subtle)] xl:inline-flex'
          }
        >
          {item.label}
          <span className="rounded-[5px] bg-[var(--badge-neutral-bg)] px-[5px] py-0.5 text-[11px] font-extrabold uppercase leading-none text-[var(--badge-neutral-text)]">
            soon
          </span>
        </span>
      ) : (
        <RouteNavLink
          key={item.label}
          href={item.href}
          onClick={mobile ? () => setMenuOpen(false) : undefined}
          className={
            mobile
              ? 'flex min-h-[44px] items-center rounded-[10px] px-3 py-2.5 text-[15px] font-bold'
              // 600 thay 700: 7 mục cạnh nhau ở 700 đọc thành một mảng chữ đặc, lại nặng ngang wordmark
              // nên logo bị hoà vào nav. min-h-44 để mọi mục cao bằng cụm tài khoản bên phải (và đủ
              // vùng chạm) — chữ vẫn 14px nên KHÔNG tốn thêm chiều ngang ở tầng nén.
              : 'flex min-h-[44px] items-center text-[14px] font-semibold transition-colors'
          }
          activeClassName={mobile ? 'bg-[#F0ECFF] text-[#5B43C7]' : 'text-[#5B43C7] underline decoration-2 underline-offset-8'}
          inactiveClassName={mobile ? 'text-[#564F6B] hover:bg-[#F0ECFF] hover:text-[#5B43C7]' : 'text-[#564F6B] hover:text-[#5B43C7]'}
        >
          {item.label}
        </RouteNavLink>
      ),
    )

  return (
    <>
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-[rgba(42,39,64,0.09)] bg-[rgba(251,249,255,0.92)] backdrop-blur-[12px] backdrop-saturate-[180%]">
        <div className="mx-auto flex h-[72px] w-[var(--site-container)] min-w-0 items-center gap-4">
          <Logo href="/" size={38} textClassName="text-[17px]" withShadow={false} />

          {/* `lap` (960px) thay cho `xl`: laptop chạy display scaling 150–200% có viewport CSS ~960–1150px,
              trước đây rơi vào nhánh hamburger dù đang dùng máy tính. 960–1279px = tầng NÉN (gap 12,
              ẩn chip Speaking-soon, nút Log out thu về icon) — đo thật ở 1000px: khách 797/953px,
              đã đăng nhập 919/953px (còn dư cả khi số dư 6 chữ số). ≥1280 giữ nguyên bố cục cũ.

              `justify-center` (không phải mặc định justify-start): nav là ô co giãn nên khi còn chỗ,
              các mục dồn về GIỮA thanh thay vì dính vào logo rồi bỏ trống ~170px trước cụm bên phải
              (đo ở 1000px khách: mục cuối kết thúc x=643 trong khi cụm phải bắt đầu x=810). Khi hết
              chỗ — laptop 960px lúc đã đăng nhập — ô nav co lại vừa nội dung nên căn giữa tự thành
              vô hiệu: bố cục quay về đúng như cũ, KHÔNG có nguy cơ tràn. */}
          <nav aria-label="Điều hướng chính" lang="en" className="hidden min-w-0 flex-1 items-center justify-center gap-3 lap:flex xl:gap-[22px]">
            {navItems(false)}
          </nav>

          <div className="ml-auto hidden flex-none items-center gap-2.5 lap:flex xl:gap-3.5">
            {email ? (
              <>
                <RouteNavLink
                  href="/dashboard"
                  className="flex min-h-[44px] items-center text-[14px] font-bold transition-colors"
                  activeClassName="text-[#5B43C7] underline decoration-2 underline-offset-8"
                  inactiveClassName="text-[#2A2740] hover:text-[#5B43C7]"
                >
                  Dashboard
                </RouteNavLink>
                <span
                  title="Số dư xương cá"
                  className="flex min-h-[44px] items-center gap-2 rounded-full border border-[#EDE7F5] bg-white px-3 text-[13.5px] font-extrabold text-[#2A2740] shadow-[0_4px_12px_rgba(42,39,64,0.05)] xl:px-3.5"
                >
                  <FishBone /> {coins ?? '—'}
                </span>
                {/* 960–1279px: icon-only (vẫn 44×44 chạm tay + aria-label/title đọc được), ≥1280 hiện chữ. */}
                <button
                  onClick={logout}
                  aria-label="Log out"
                  title="Log out"
                  className="flex h-11 w-11 flex-none items-center justify-center px-1 text-[14px] font-bold text-[#2A2740] transition-colors hover:text-[#5B43C7] xl:h-auto xl:w-auto"
                >
                  <span className="hidden xl:inline">Log out</span>
                  <svg className="xl:hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
                    <path d="M15 16l4-4-4-4" />
                    <path d="M19 12H9" />
                  </svg>
                </button>
                <RouteNavLink
                  href="/account"
                  aria-label="Tài khoản"
                  title="Tài khoản"
                  className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-[11px] shadow-[0_6px_14px_-4px_rgba(124,92,230,0.6)] transition-opacity hover:opacity-90"
                  activeClassName="ring-2 ring-[#6842D8] ring-offset-2"
                >
                  <AccountAvatar name={email} email={email} avatar={avatar} size={36} radius={11} fontSize={15} />
                </RouteNavLink>
              </>
            ) : (
              <>
                {/* Log in là nút phụ đi kèm CTA chính: cho nó cùng bo góc + cùng chiều cao để hai nút
                    thành một cặp, thay vì một dòng chữ trơ trọi cạnh một khối tím. */}
                <RouteNavLink
                  href="/login"
                  className="flex min-h-[44px] items-center rounded-[11px] px-3 text-[14px] font-bold transition-colors"
                  activeClassName="bg-[#F0ECFF] text-[#5B43C7]"
                  inactiveClassName="text-[#2A2740] hover:bg-[#F0ECFF] hover:text-[#5B43C7]"
                  match="exact"
                >
                  Log in
                </RouteNavLink>
                <RouteNavLink
                  href="/register"
                  className="flex min-h-[44px] items-center rounded-[11px] bg-[#7C5CE6] px-[18px] text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(124,92,230,0.22)] transition-colors hover:bg-[#6A48D6]"
                  activeClassName="ring-2 ring-[#6842D8] ring-offset-2"
                  match="exact"
                >
                  Start free
                </RouteNavLink>
              </>
            )}
          </div>

          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="ml-auto flex h-11 w-11 flex-none items-center justify-center rounded-[10px] border border-[#EDE7F5] bg-white text-[#2A2740] shadow-[0_4px_12px_rgba(42,39,64,0.05)] lap:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <nav id="mobile-nav" aria-label="Điều hướng chính trên thiết bị nhỏ" className="border-t border-[rgba(42,39,64,0.07)] bg-[rgba(251,249,255,0.99)] px-4 py-3 lap:hidden">
            <ul className="mx-auto flex max-w-[1200px] flex-col gap-0.5">
              {navItems(true).map((item, index) => <li lang="en" key={MAIN_NAV[index]?.label ?? index}>{item}</li>)}
              <li className="mt-2 border-t border-[#EDE7F5] pt-2">
                {email ? (
                  <div className="grid gap-1 sm:grid-cols-2">
                    <RouteNavLink href="/dashboard" onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center rounded-[10px] px-3 text-[15px] font-bold" activeClassName="bg-[#F0ECFF] text-[#5B43C7]" inactiveClassName="text-[#2A2740] hover:bg-[#F0ECFF]">
                      Dashboard
                    </RouteNavLink>
                    <RouteNavLink href="/account" onClick={() => setMenuOpen(false)} className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-[10px] px-3 text-[15px] font-bold" activeClassName="bg-[#F0ECFF] text-[#5B43C7]" inactiveClassName="text-[#2A2740] hover:bg-[#F0ECFF]">
                      <AccountAvatar name={email} email={email} avatar={avatar} size={30} radius={9} fontSize={13} />
                      <span className="min-w-0 truncate">Tài khoản</span>
                    </RouteNavLink>
                    <span className="flex min-h-[44px] items-center gap-2 rounded-[10px] px-3 text-[14px] font-bold text-[#2A2740]">
                      <FishBone /> {coins ?? '—'} xương cá
                    </span>
                    <button onClick={logout} className="min-h-[44px] rounded-[10px] px-3 text-left text-[15px] font-bold text-[var(--text-danger)] hover:bg-[#FFF0F0]">
                      Log out
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-1 sm:grid-cols-2">
                    <RouteNavLink href="/login" onClick={() => setMenuOpen(false)} match="exact" className="flex min-h-[44px] items-center rounded-[10px] px-3 text-[15px] font-bold" activeClassName="bg-[#F0ECFF] text-[#5B43C7]" inactiveClassName="text-[#2A2740] hover:bg-[#F0ECFF]">
                      Log in
                    </RouteNavLink>
                    <RouteNavLink href="/register" onClick={() => setMenuOpen(false)} match="exact" className="flex min-h-[44px] items-center rounded-[10px] bg-[#7C5CE6] px-3 text-[15px] font-bold text-white hover:bg-[#6A48D6]">
                      Start free
                    </RouteNavLink>
                  </div>
                )}
              </li>
            </ul>
          </nav>
        )}
      </header>
    </>
  )
}