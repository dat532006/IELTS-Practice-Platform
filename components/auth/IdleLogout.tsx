'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { performLogout } from '@/lib/auth/logout'
import { makeActivityBus } from '@/lib/auth/cross-tab'

// Passive logout (2026-07-13, Owner duyệt): treo máy quá hạn → tự đăng xuất + về /login?reason=idle.
// - Đếm bằng TIMESTAMP + interval (KHÔNG setTimeout thuần): máy sleep/tab bị throttle, tỉnh dậy
//   check thấy đã quá hạn là văng ngay — đúng kịch bản "treo máy".
// - CHỈ chạy khi có session (guest không bị ảnh hưởng).
// - LOẠI TRỪ trang đang thi (/exam/*, /writing/*): thí sinh nghe audio/đọc passage có thể không chạm
//   chuột rất lâu — timer riêng của đề đã giới hạn thời gian; thời gian ở trang thi tính là active.
// - /admin/* ngưỡng chặt hơn (rủi ro cao hơn).

const DEFAULT_LIMIT_MS = 30 * 60_000 // 30 phút
const ADMIN_LIMIT_MS = 15 * 60_000 // 15 phút cho khu quản trị
const CHECK_EVERY_MS = 30_000
const EXCLUDED_PREFIXES = ['/exam/', '/writing/']

export function IdleLogout() {
  const pathname = usePathname()
  const lastActiveRef = useRef(Date.now())
  const signedInRef = useRef(false)
  const loggingOutRef = useRef(false)
  // pathname vào ref để interval luôn đọc route hiện tại mà không phải re-arm toàn bộ listener.
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }) => {
      signedInRef.current = !!data.session
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      signedInRef.current = !!session
      lastActiveRef.current = Date.now() // vừa đăng nhập/refresh = đang hoạt động
    })

    // SEC-003 — chia sẻ mốc hoạt động giữa các tab: tab này chạm → broadcast (throttle 5s); nhận ts từ
    //   tab khác → nâng lastActive. Nhờ đó tab IDLE KHÔNG đăng xuất khi còn tab khác đang dùng; chỉ khi
    //   MỌI tab idle quá hạn mới logout (không còn "idle B văng cả tab active A").
    const bus = makeActivityBus()
    let lastBroadcast = 0
    const mark = () => {
      const now = Date.now()
      lastActiveRef.current = now
      if (now - lastBroadcast > 5_000) { lastBroadcast = now; bus.post(now) }
    }
    const unsubBus = bus.subscribe((ts) => {
      if (ts > lastActiveRef.current) lastActiveRef.current = ts
    })
    // capture: bắt cả scroll/gõ phím trong container con (scroll không bubble).
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    for (const ev of events) window.addEventListener(ev, mark, { passive: true, capture: true })

    const check = async () => {
      if (!signedInRef.current || loggingOutRef.current) return
      const p = pathRef.current ?? ''
      if (EXCLUDED_PREFIXES.some((x) => p.startsWith(x))) {
        lastActiveRef.current = Date.now() // đang thi → coi là active (rời trang thi mới đếm lại từ đầu)
        return
      }
      const limit = p.startsWith('/admin') ? ADMIN_LIMIT_MS : DEFAULT_LIMIT_MS
      if (Date.now() - lastActiveRef.current < limit) return
      loggingOutRef.current = true
      // SEC-002 — checked signOut + local fallback + invalidate header cache (helper) rồi mới điều hướng.
      await performLogout()
      window.location.href = '/login?reason=idle'
    }
    const interval = setInterval(() => void check(), CHECK_EVERY_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check() // tỉnh dậy từ sleep → check ngay
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      sub.subscription.unsubscribe()
      unsubBus()
      bus.close()
      document.removeEventListener('visibilitychange', onVisibility)
      for (const ev of events) window.removeEventListener(ev, mark, { capture: true })
    }
  }, [])

  return null
}
