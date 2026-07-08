import { createClient } from '@/lib/supabase/client'

// Cache client-side cho auth state + coins/avatar hiển thị ở Header (2026-07-08, nav-lag fix).
// Header remount khi điều hướng giữa segment landing (/) và (marketing) → trước đây mỗi lần
// remount là 2 round-trip Supabase (getUser + profiles) gây nhấp nháy coin pill/auth area.
// Cache promise ở module scope: fetch đúng 1 lần / page load; full reload (mua hàng, logout,
// login redirect) tự làm mới vì module state reset. CHỈ chứa dữ liệu own-row RLS đã cho phép.
export type HeaderProfile = { email: string | null; coins: number | null; avatar: string | null }

let cache: Promise<HeaderProfile> | null = null

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

export function invalidateHeaderProfile(): void {
  cache = null
}
