'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FishBone } from '@/components/brand/FishBone'
import { AccountAvatar } from '@/components/account/AccountAvatar'

// Header actions cho trang chủ (landing) — phản ánh trạng thái đăng nhập giống Header dùng chung.
// Guest: Log in / Start free. Đã đăng nhập: Dashboard + số dư xương cá + Log out.
export function LandingHeaderActions() {
  const [email, setEmail] = useState<string | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active) return
        if (!data.user) {
          setReady(true)
          return
        }
        setEmail(data.user.email ?? null)
        const { data: profile } = await supabase
          .from('profiles')
          .select('coins, avatar')
          .eq('id', data.user.id)
          .single()
        if (active) {
          setCoins(profile?.coins ?? 0)
          setAvatar(profile?.avatar ?? null)
          setReady(true)
        }
      })
      .catch(() => {
        if (active) setReady(true)
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

  // Trước khi biết trạng thái: render guest (tránh nhấp nháy layout, khớp SSR).
  if (!ready || !email) {
    return (
      <div className="hdr-actions">
        <Link href="/login" className="btn-login">
          Log in
        </Link>
        <Link href="/register" className="btn-start">
          Start free
        </Link>
      </div>
    )
  }

  return (
    <div className="hdr-actions">
      <Link href="/dashboard" className="btn-login">
        Dashboard
      </Link>
      <span
        title="Số dư xương cá"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: 800,
          fontSize: '14px',
          color: '#2A2740',
          background: '#fff',
          border: '1px solid #EDE7F5',
          borderRadius: '999px',
          padding: '6px 13px',
          boxShadow: '0 4px 12px rgba(42,39,64,0.05)',
        }}
      >
        <FishBone /> {coins ?? '—'}
      </span>
      <button type="button" onClick={logout} className="btn-login">
        Log out
      </button>
      <Link href="/account" aria-label="Tài khoản" title="Tài khoản" className="flex flex-none overflow-hidden rounded-[11px]">
        <AccountAvatar name={email} email={email} avatar={avatar} size={34} radius={11} fontSize={14} />
      </Link>
    </div>
  )
}
