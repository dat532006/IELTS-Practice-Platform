'use client'

import { RouteNavLink } from '@/components/layout/RouteNavLink'

const TABS = [
  { href: '/dashboard', label: 'Tổng quan' },
  { href: '/dashboard/history', label: 'Lịch sử làm bài' },
  { href: '/dashboard/vocab', label: 'Sổ từ vựng' },
] as const

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-w-0 max-w-5xl px-4 py-10 text-[#2A2740]">
      <h1 className="text-[28px] font-extrabold tracking-[-0.025em]">Bảng điều khiển</h1>
      <nav aria-label="Điều hướng bảng điều khiển" className="mt-5 flex flex-wrap gap-2 border-b border-[#EEEAF3]">
        {TABS.map((tab) => (
          <RouteNavLink
            key={tab.href}
            href={tab.href}
            match="exact"
            className="-mb-px flex min-h-[44px] items-center rounded-t-[10px] border-b-2 px-4 text-[14px] font-bold transition-colors"
            activeClassName="border-[#7C5CE6] text-[#5B43C7]"
            inactiveClassName="border-transparent text-[var(--text-muted)] hover:text-[#5B43C7]"
          >
            {tab.label}
          </RouteNavLink>
        ))}
      </nav>
      <div className="mt-8 min-w-0">{children}</div>
    </div>
  )
}