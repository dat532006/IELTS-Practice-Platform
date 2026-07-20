'use client'

import Link from 'next/link'
import { SKILL_META, SkillGlyph } from '@/components/brand/skill'
import type { LibraryPack } from './types'

const CARD =
  'rounded-[20px] border border-[#EEEAF3] bg-white p-[26px] shadow-[0_22px_44px_-36px_rgba(90,60,160,0.4)]'

export function LibraryPanel({ library }: { library: LibraryPack[] }) {
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="text-[18px] font-extrabold tracking-[-0.01em] text-[#2A2740]">Thư viện · đã mua</h2>
        <span className="text-[12.5px] font-bold text-[var(--text-subtle)]">{library.length} gói sở hữu</span>
      </div>

      {library.length === 0 ? (
        <p className="mt-4 rounded-[14px] border border-[#F1EDF7] bg-[#FBFAFD] px-4 py-8 text-center text-[14px] font-semibold text-[var(--text-subtle)]">
          Bạn chưa sở hữu gói đề nào.{' '}
          <Link href="/products" className="font-bold text-[#6A48D6] underline">
            Khám phá bộ đề →
          </Link>
        </p>
      ) : (
        <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {library.map((pack) => {
            const meta = SKILL_META[pack.skill] ?? SKILL_META.reading
            const done = pack.totalTests > 0 && pack.completedTests >= pack.totalTests
            const pct = pack.totalTests > 0 ? Math.round((pack.completedTests / pack.totalTests) * 100) : 0
            return (
              <Link
                key={pack.slug}
                href={`/products/${pack.slug}`}
                className="flex flex-col overflow-hidden rounded-[16px] border border-[#EEEAF3] bg-white shadow-[0_12px_26px_-22px_rgba(60,40,90,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-22px_rgba(60,40,90,0.4)]"
              >
                <div className="relative flex aspect-[16/9] items-center justify-center" style={{ background: meta.grad }}>
                  <span className="absolute left-3 top-2.5 text-[10px] font-extrabold tracking-[0.1em] text-white/90">
                    {meta.coverLabel}
                  </span>
                  <span className="absolute right-3 top-2.5 rounded-full bg-[rgba(30,158,99,0.9)] px-2 py-[3px] text-[10px] font-extrabold text-white">
                    Đã sở hữu
                  </span>
                  <span className="text-white/85">
                    <SkillGlyph skill={pack.skill} size={34} strokeWidth={1.7} />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <div className="text-[14.5px] font-extrabold tracking-[-0.01em] text-[#2A2740]">{pack.title}</div>
                  <div className="mt-1 text-[12px] font-semibold text-[var(--text-muted)]">
                    {pack.totalTests} đề · {pack.completedTests} đã xong
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#F0ECFF]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct}%`, background: done ? '#1E9E63' : '#7C5CE6' }}
                    />
                  </div>
                  <span className="mt-3 text-[13px] font-extrabold text-[#6A48D6]">
                    {done ? 'Xem lại →' : 'Tiếp tục →'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
