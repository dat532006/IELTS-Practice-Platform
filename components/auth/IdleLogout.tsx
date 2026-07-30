'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { performLogout } from '@/lib/auth/logout'
import { makeActivityBus } from '@/lib/auth/cross-tab'
import { IDLE_CHECK_EVERY_MS, idleLimitForPath, isActivityAuthEvent, shouldIdleLogout } from '@/lib/auth/idle'

// Passive logout (2026-07-13, Owner duyệt): treo máy quá hạn → tự đăng xuất + về /login?reason=idle.
// Ngưỡng + luật quyết định nằm ở lib/auth/idle.ts (PURE, có gate riêng). File này chỉ lo phần trình
// duyệt: nghe sự kiện, chia sẻ mốc hoạt động giữa tab, gọi logout rồi điều hướng.

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
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      signedInRef.current = !!session
      // CHỈ đăng nhập/mở phiên mới tính là hoạt động. TOKEN_REFRESHED là việc nền của supabase-js —
      // xem lý do trong isActivityAuthEvent (nếu tính, đồng hồ idle có thể không bao giờ chạy tới hạn).
      if (isActivityAuthEvent(event)) lastActiveRef.current = Date.now()
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
      if (loggingOutRef.current) return
      const p = pathRef.current ?? ''
      if (idleLimitForPath(p) === null) {
        lastActiveRef.current = Date.now() // đang thi → coi là active (rời trang thi mới đếm lại từ đầu)
        return
      }
      if (!shouldIdleLogout({ signedIn: signedInRef.current, path: p, now: Date.now(), lastActive: lastActiveRef.current })) return
      loggingOutRef.current = true
      // SEC-002 — checked signOut + local fallback + invalidate header cache (helper) rồi mới điều hướng.
      await performLogout()
      window.location.href = '/login?reason=idle'
    }
    const interval = setInterval(() => void check(), IDLE_CHECK_EVERY_MS)
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
