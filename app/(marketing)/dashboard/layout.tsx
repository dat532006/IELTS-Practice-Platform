'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// W17 — Dashboard shell (M09). Sub-nav Tổng quan / Lịch sử / Sổ từ vựng. Chrome (Header/Footer) từ (marketing) layout.
const TABS = [
  { href: '/dashboard', label: 'Tổng quan' },
  { href: '/dashboard/history', label: 'Lịch sử làm bài' },
  { href: '/dashboard/vocab', label: 'Sổ từ vựng' },
] as const

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 text-[#2A2740]">
      <h1 className="text-[28px] font-extrabold tracking-[-0.025em]">Bảng điều khiển</h1>
      <nav className="mt-5 flex flex-wrap gap-2 border-b border-[#EEEAF3]">
        {TABS.map((t) => {
          const active = path === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`-mb-px rounded-t-[10px] border-b-2 px-4 py-2.5 text-[14px] font-bold transition ${
                active
                  ? 'border-[#7C5CE6] text-[#6A48D6]'
                  : 'border-transparent text-[#857F96] hover:text-[#5B43C7]'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-8">{children}</div>
    </div>
  )
}
