import Link from 'next/link'
import { Mascot } from '@/components/brand/Mascot'
import { LEGAL_PAGES, LEGAL_SLUGS } from '@/lib/legal'

// Footer thống nhất toàn site (Owner chốt phương án B, 2026-07-08): cấu trúc theo footer landing
// (source of truth) — 4 cột Skills/Explore/Account + hàng legal; mô tả brand theo copy Owner (4.3).
// Dùng ở cả app/page.tsx (landing) và app/(marketing)/layout.tsx — KHÔNG còn 2 footer riêng.
const COLS: { title: string; links: { label: string; href?: string }[] }[] = [
  {
    title: 'Skills',
    links: [
      { label: 'Reading', href: '/products?skill=reading' },
      { label: 'Listening', href: '/products?skill=listening' },
      { label: 'Writing', href: '/products?skill=writing' },
      { label: 'Speaking (soon)' }, // ngoài scope v1 — không link
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'Free tests', href: '/free' },
      { label: 'Prediction', href: '/prediction' },
      { label: 'Hot collections', href: '/products' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Giới thiệu', href: '/about' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Start free', href: '/register' },
      { label: 'Top up coins', href: '/pricing' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[#EBE6F2] bg-[rgba(255,255,255,0.5)]">
      <div className="mx-auto grid w-[min(1200px,93vw)] gap-8 py-12 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.02em] text-[#2A2740]"
          >
            <Mascot size={30} />
            <span>
              <span className="text-[#7C5CE6]">IELTS</span>Practice
            </span>
          </Link>
          <p className="mt-3.5 max-w-[24em] text-sm leading-[1.6] text-[#857F96]">
            Nền tảng luyện đề IELTS mô phỏng giao diện thi thật, hỗ trợ Reading · Listening · Writing và AI chấm
            Writing.
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <div className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-[#2A2740]">{col.title}</div>
            <ul className="mt-3.5 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href ? (
                    <Link href={l.href} className="text-sm font-semibold text-[#6A6480] transition hover:text-[#7C5CE6]">
                      {l.label}
                    </Link>
                  ) : (
                    <span className="cursor-not-allowed text-sm font-semibold text-[#A8A2BA]">{l.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#EBE6F2]">
        <div className="mx-auto flex w-[min(1200px,93vw)] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 text-[13px] font-semibold text-[#9D96AE]">
          <span>© 2026 IELTSPractice. All rights reserved.</span>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {LEGAL_SLUGS.map((slug) => (
              <Link key={slug} href={`/legal/${slug}`} className="transition hover:text-[#7C5CE6]">
                {LEGAL_PAGES[slug].title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
