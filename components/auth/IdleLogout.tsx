'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { invalidateHeaderProfile } from '@/lib/auth/client-profile'

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

    const mark = () => {
      lastActiveRef.current = Date.now()
    }
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
      try {
        await supabase.auth.signOut() // revoke server-side (global)
      } catch {
        // Mạng lỗi → ít nhất xóa session CỤC BỘ (cookie) để logout dính — không thì /login
        // thấy session còn sống sẽ đẩy ngược về dashboard (guard 2026-07-13).
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch {
          /* hết cách — điều hướng vẫn diễn ra */
        }
      }
      invalidateHeaderProfile() // header public cache email/coin (bài học PR #23)
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
      document.removeEventListener('visibilitychange', onVisibility)
      for (const ev of events) window.removeEventListener(ev, mark, { capture: true })
    }
  }, [])

  return null
}
