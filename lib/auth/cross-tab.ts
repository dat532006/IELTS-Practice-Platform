// ============================================================
// Cross-tab auth/session signals (SEC-003 idle activity + UI-002 cache invalidation).
// CHỈ truyền TIMESTAMP (activity) và tín hiệu "đổi" (auth invalidate) — KHÔNG BAO GIỜ token/session
//   (SEC invariant "no token broadcast"). BroadcastChannel same-origin; không hỗ trợ → no-op (degrade
//   về per-tab, an toàn). PURE wiring, không phụ thuộc React/Supabase.
// ============================================================

const ACTIVITY_CHANNEL = 'ielts-activity'
const AUTH_INVALIDATE_CHANNEL = 'ielts-auth-invalidate'

function makeChannel(name: string): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  try { return new BroadcastChannel(name) } catch { return null }
}

// SEC-003 — chia sẻ mốc "hoạt động lần cuối" giữa các tab: tab ACTIVE broadcast ts; tab IDLE nhận ts →
//   không tự đăng xuất khi còn tab khác đang dùng. (Chỉ khi MỌI tab idle quá hạn mới logout.)
export type ActivityBus = { post: (ts: number) => void; subscribe: (fn: (ts: number) => void) => () => void; close: () => void }
export function makeActivityBus(): ActivityBus {
  const ch = makeChannel(ACTIVITY_CHANNEL)
  return {
    post(ts) { try { ch?.postMessage(ts) } catch { /* */ } },
    subscribe(fn) {
      if (!ch) return () => {}
      const h = (e: MessageEvent) => { if (typeof e.data === 'number') fn(e.data) }
      ch.addEventListener('message', h)
      return () => ch.removeEventListener('message', h)
    },
    close() { try { ch?.close() } catch { /* */ } },
  }
}

// UI-002 — tín hiệu "auth/profile/coin đã đổi" (login/logout/mua hàng/avatar) → tab khác drop cache +
//   cập nhật Header không cần reload.
export type AuthInvalidateBus = { post: () => void; subscribe: (fn: () => void) => () => void; close: () => void }
export function makeAuthInvalidateBus(): AuthInvalidateBus {
  const ch = makeChannel(AUTH_INVALIDATE_CHANNEL)
  return {
    post() { try { ch?.postMessage(Date.now()) } catch { /* */ } },
    subscribe(fn) {
      if (!ch) return () => {}
      const h = () => fn()
      ch.addEventListener('message', h)
      return () => ch.removeEventListener('message', h)
    },
    close() { try { ch?.close() } catch { /* */ } },
  }
}
