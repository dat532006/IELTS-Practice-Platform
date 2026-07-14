import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// SEC-001 — Ban-aware resolver (nguồn duy nhất): getUser() xác thực JWT, rồi is_user_banned() (RPC
// đọc auth.users.banned_until) chặn token cũ của user đã bị ban. Ban qua Supabase Auth chỉ chặn
// login/refresh; access token đã phát vẫn còn hạn ~1h → phải chặn ở tầng ứng dụng + RLS (migration
// 20260714000100). Dùng client RLS của chính user (đã có JWT) để gọi RPC.
//   - user null (chưa đăng nhập) → null.
//   - banned=true → null (route trả 401/403 TRƯỚC business logic).
//   - RPC lỗi (vd DB chưa migrate) → fail-open, coi như không ban: tránh global outage; direct
//     PostgREST write vẫn bị RLS chặn cứng ở DB. Deploy DB TRƯỚC server để đóng cửa sổ này.
export async function getAuthedUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: banned, error } = await supabase.rpc('is_user_banned', { uid: user.id })
  if (error) return user
  if (banned === true) return null
  return user
}

// Lấy user hiện tại (server-side, đã verify qua getUser + ban check). Shared primitive cho mọi route.
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient()
  return getAuthedUser(supabase)
}

// 🔐 Admin guard — kiểm tra role Ở SERVER, không chỉ ẩn UI (plan §11 "Admin").
// Đọc profiles.role qua client của chính user (RLS: select own row). User bị ban bị chặn TRƯỚC.
export async function requireAdmin() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)
  if (!user) return { ok: false as const, reason: 'UNAUTHORIZED' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { ok: false as const, reason: 'FORBIDDEN' as const }
  return { ok: true as const, user }
}
