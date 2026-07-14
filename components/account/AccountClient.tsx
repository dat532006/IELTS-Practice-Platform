'use client'

import { useState } from 'react'
import { performLogout } from '@/lib/auth/logout'
import { FishBone } from '@/components/brand/FishBone'
import { AccountAvatar } from './AccountAvatar'
import { ProfilePanel } from './ProfilePanel'
import { SecurityPanel } from './SecurityPanel'
import { WalletPanel } from './WalletPanel'
import { LibraryPanel } from './LibraryPanel'
import type { AccountData } from './types'

type Tab = 'profile' | 'security' | 'wallet' | 'library'

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'profile',
    label: 'Hồ sơ',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20c0-4 3.6-6.2 7.5-6.2S19.5 16 19.5 20" />
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Bảo mật',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="9" rx="2.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
  {
    id: 'wallet',
    label: 'Ví xương cá',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Thư viện',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14H6.5A2.5 2.5 0 0 0 4 20.5z" />
        <path d="M4 6.5V20" />
      </svg>
    ),
  },
]

const LogoutGlyph = ({ stroke = 'currentColor' }: { stroke?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h11" />
  </svg>
)

export function AccountClient({ data }: { data: AccountData }) {
  const [tab, setTab] = useState<Tab>('profile')
  const { profile, transactions, library } = data

  async function logout() {
    // SEC-002 — checked signOut + local fallback + invalidate header cache (helper), rồi mới điều hướng.
    await performLogout()
    window.location.href = '/'
  }

  return (
    <div className="bg-[radial-gradient(120%_60%_at_90%_-6%,#FBE6DC_0%,rgba(251,230,220,0)_46%),radial-gradient(80%_50%_at_2%_-4%,#EFEAFF_0%,rgba(239,234,255,0)_44%),#FBF9FF]">
      <div className="mx-auto max-w-6xl px-4 py-10 text-[#2A2740]">
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em]">Tài khoản của bạn</h1>
        <p className="mt-1.5 text-[15px] font-semibold text-[#6A6480]">
          Quản lý hồ sơ, bảo mật, xương cá và thư viện của bạn.
        </p>

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[262px_1fr]">
          {/* ░░ SIDEBAR ░░ */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
            {/* identity card */}
            <div className="rounded-[20px] border border-[#EEEAF3] bg-white p-[22px] text-center shadow-[0_22px_44px_-34px_rgba(90,60,160,0.4)]">
              <div className="relative mx-auto w-fit">
                <AccountAvatar name={profile.name} email={profile.email} avatar={profile.avatar} size={82} radius={24} fontSize={34} />
                <button
                  type="button"
                  onClick={() => setTab('profile')}
                  aria-label="Sửa ảnh đại diện"
                  title="Sửa ảnh đại diện"
                  className="absolute -bottom-1 -right-1 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[#EEEAF3] bg-white shadow-[0_4px_10px_rgba(42,39,64,0.12)] transition hover:border-[#CCC3DC]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C5CE6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
              </div>
              <div className="mt-3.5 text-[17px] font-extrabold tracking-[-0.01em]">{profile.name || 'Người dùng'}</div>
              <div className="mt-0.5 truncate text-[12.5px] font-semibold text-[#9D96AE]">{profile.email ?? '—'}</div>
              <div className="mt-3.5 inline-flex items-center gap-[7px] rounded-full border border-[#EFEAFF] bg-[#FAF8FF] px-3.5 py-[7px] text-[14px] font-extrabold text-[#2A2740]">
                <FishBone /> {profile.coins} <span className="text-[12.5px] font-semibold text-[#9D96AE]">xương cá</span>
              </div>
            </div>

            {/* nav */}
            <div className="flex flex-col gap-0.5 rounded-[20px] border border-[#EEEAF3] bg-white p-2 shadow-[0_22px_44px_-34px_rgba(90,60,160,0.4)]">
              {NAV.map((item) => {
                const active = tab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`flex items-center gap-2.5 rounded-[13px] px-3.5 py-3 text-left text-[14px] transition ${
                      active ? 'bg-[#F0ECFF] font-extrabold text-[#6A48D6]' : 'font-bold text-[#564F6B] hover:bg-[#FBFAFF]'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                )
              })}
              <div className="mx-2.5 my-1.5 h-px bg-[#EEEAF3]" />
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-2.5 rounded-[13px] px-3.5 py-3 text-left text-[14px] font-extrabold text-[#D24A4A] transition hover:bg-[#FDF3F3]"
              >
                <LogoutGlyph />
                Đăng xuất
              </button>
            </div>
          </aside>

          {/* ░░ MAIN ░░ */}
          <div className="flex flex-col gap-5">
            {tab === 'profile' && <ProfilePanel profile={profile} />}
            {tab === 'security' && <SecurityPanel email={profile.email} />}
            {tab === 'wallet' && <WalletPanel coins={profile.coins} transactions={transactions} />}
            {tab === 'library' && <LibraryPanel library={library} />}

            {/* Sign out row — luôn hiện ở mọi tab */}
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#F3DADA] bg-white px-[26px] py-[22px] shadow-[0_22px_44px_-36px_rgba(90,60,160,0.4)]">
              <div>
                <div className="text-[15px] font-extrabold text-[#2A2740]">Đăng xuất</div>
                <div className="mt-[3px] text-[13px] font-semibold text-[#857F96]">Kết thúc phiên trên thiết bị này.</div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-[12px] border border-[#E9B7B7] bg-white px-5 py-2.5 text-[14px] font-extrabold text-[#D24A4A] transition hover:bg-[#FDF3F3]"
              >
                <LogoutGlyph stroke="#D24A4A" />
                Đăng xuất
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
