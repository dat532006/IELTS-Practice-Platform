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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-lg font-bold text-teal-700">
          IELTS<span className="text-slate-900">Practice</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-4 md:flex">
          {MAIN_NAV.map((item) =>
            item.comingSoon ? (
              <span
                key={item.label}
                title="Coming soon — ngoài scope v1"
                aria-disabled="true"
                className="cursor-not-allowed text-sm text-slate-400"
              >
                {item.label}
                <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] uppercase">soon</span>
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm text-slate-700 hover:text-teal-700"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {email ? (
            <>
              <span className="text-sm text-slate-600" title="Số dư coin">
                🪙 {coins ?? '—'}
              </span>
              <span className="hidden max-w-[12rem] truncate text-sm text-slate-500 sm:inline">
                {email}
              </span>
              <button onClick={logout} className="text-sm text-slate-700 hover:text-teal-700">
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-slate-700 hover:text-teal-700">
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
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
