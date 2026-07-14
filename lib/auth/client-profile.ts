import { createClient } from '@/lib/supabase/client'
import { makeAuthInvalidateBus, type AuthInvalidateBus } from '@/lib/auth/cross-tab'

// Cache client-side cho auth state + coins/avatar hiển thị ở Header (2026-07-08, nav-lag fix).
// Header remount khi điều hướng giữa segment landing (/) và (marketing) → trước đây mỗi lần
// remount là 2 round-trip Supabase (getUser + profiles) gây nhấp nháy coin pill/auth area.
// Cache promise ở module scope: fetch đúng 1 lần / page load.
// UI-002 — trước đây cache KHÔNG có invalidation/subscription: login/logout/mua hàng/avatar ở tab này
//   (hoặc tab khác) không cập nhật Header cho tới khi full reload → chrome/CTA sai. Giờ:
//   invalidate → drop cache + notify listener trong tab + broadcast cho tab khác; Header subscribe để
//   tự refetch (không reload). CHỈ chứa own-row RLS đã cho phép; KHÔNG broadcast token (SEC invariant).
export type HeaderProfile = { email: string | null; coins: number | null; avatar: string | null }

let cache: Promise<HeaderProfile> | null = null
const listeners = new Set<() => void>()
let bus: AuthInvalidateBus | null = null

function ensureBus(): AuthInvalidateBus {
  if (bus) return bus
  bus = makeAuthInvalidateBus()
  // Tab khác báo đổi → drop cache + notify UI tab này. KHÔNG re-broadcast (tránh echo loop).
  bus.subscribe(() => { cache = null; notify() })
  return bus
}
function notify(): void { for (const l of listeners) l() }

async function load(): Promise<HeaderProfile> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return { email: null, coins: null, avatar: null }
    const { data: profile } = await supabase
      .from('profiles')
      .select('coins, avatar')
      .eq('id', data.user.id)
      .single()
    return {
      email: data.user.email ?? null,
      coins: profile?.coins ?? 0,
      avatar: profile?.avatar ?? null,
    }
  } catch {
    // Chưa đăng nhập / env chưa cấu hình → trạng thái logged-out.
    return { email: null, coins: null, avatar: null }
  }
}

export function getHeaderProfile(): Promise<HeaderProfile> {
  if (!cache) cache = load()
  return cache
}

// broadcast=false khi xử lý tín hiệu ĐẾN từ tab khác (tránh vọng lại). Mặc định broadcast.
export function invalidateHeaderProfile(broadcast = true): void {
  cache = null
  if (broadcast) ensureBus().post()
  notify()
}

// UI-002 — Header subscribe để cập nhật khi auth/profile đổi (trong tab qua onAuthStateChange, hoặc
//   cross-tab qua bus). Trả unsubscribe.
export function subscribeHeaderProfile(fn: () => void): () => void {
  ensureBus() // đảm bảo lắng nghe cross-tab ngay cả khi tab này chưa tự invalidate
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
