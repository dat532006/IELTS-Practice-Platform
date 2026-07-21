'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AdminAccountBar } from '@/components/admin/AdminAccountBar'
import { RouteNavLink } from '@/components/layout/RouteNavLink'

const ADMIN_NAV: ReadonlyArray<{ href: string; label: string; match?: 'exact' | 'prefix' }> = [
  { href: '/admin', label: 'Dashboard', match: 'exact' },
  { href: '/admin/products', label: 'Sản phẩm' },
  { href: '/admin/tests', label: 'Đề thi' },
  { href: '/admin/tips', label: 'Tips' },
  { href: '/admin/users', label: 'Người dùng' },
  { href: '/admin/activation-codes', label: 'Mã kích hoạt' },
  { href: '/admin/grants', label: 'Cấp quyền' },
  { href: '/admin/payments', label: 'Đối soát' },
]

export function AdminShell({
  children,
  email,
  userId,
}: {
  children: React.ReactNode
  email: string | null
  userId: string
}) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      window.requestAnimationFrame(() => toggleRef.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const links = (mobile: boolean) =>
    ADMIN_NAV.map((item) => (
      <RouteNavLink
        key={item.href}
        href={item.href}
        match={item.match}
        onClick={mobile ? () => setOpen(false) : undefined}
        className={mobile ? 'flex min-h-[44px] items-center rounded-[9px] px-3 text-[14px] font-semibold' : 'flex min-h-[44px] items-center rounded-[9px] px-3 text-[13px] font-semibold'}
        activeClassName="bg-[#F0ECFF] text-[#5B43C7]"
        inactiveClassName="text-[var(--text-muted)] hover:bg-[#F2EFF7] hover:text-[#2A2740]"
      >
        {item.label}
      </RouteNavLink>
    ))

  return (
    <div className="min-h-screen min-w-0 bg-[#FBFBFD] text-[#2A2740]">
      <header className="border-b border-[#EBE8F1] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-[#2A2740] text-[12px] font-extrabold text-white">
            AD
          </span>
          <Link href="/admin" className="min-w-0 truncate text-[15px] font-extrabold text-[#2A2740]">
            Quản trị nội dung
          </Link>

          <nav aria-label="Điều hướng quản trị" className="ml-2 hidden min-w-0 flex-1 items-center gap-1 xl:flex">
            {links(false)}
          </nav>
          <div className="ml-auto hidden xl:block">
            <AdminAccountBar email={email} userId={userId} />
          </div>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            aria-label={open ? 'Đóng menu quản trị' : 'Mở menu quản trị'}
            onClick={() => setOpen((value) => !value)}
            className="ml-auto flex h-11 w-11 flex-none items-center justify-center rounded-[9px] border border-[#E4DEEE] bg-white text-[#2A2740] xl:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </div>

        {open && (
          <nav id="admin-mobile-nav" aria-label="Điều hướng quản trị trên thiết bị nhỏ" className="mx-auto mt-3 max-w-6xl border-t border-[#EBE8F1] pt-3 xl:hidden">
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{links(true)}</div>
            <div className="mt-2 border-t border-[#EBE8F1] pt-2">
              <AdminAccountBar email={email} userId={userId} />
            </div>
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  )
}
