import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Lấy user hiện tại (server-side, đã verify qua getUser).
export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// 🔐 Admin guard — kiểm tra role Ở SERVER, không chỉ ẩn UI (plan §11 "Admin").
// Đọc profiles.role qua client của chính user (RLS: select own row).
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, reason: 'UNAUTHORIZED' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { ok: false as const, reason: 'FORBIDDEN' as const }
  return { ok: true as const, user }
}
