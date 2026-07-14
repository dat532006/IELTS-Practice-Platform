import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// SEC-002 — Logout AN TOÀN. `supabase.auth.signOut()` trả `{ error }` (KHÔNG throw khi server 500 /
//   token đã revoke). Callers cũ chỉ `await signOut()` rồi điều hướng → global fail để cookie CỤC BỘ
//   sống → /login guard thấy session còn → redirect loop / phiên treo. Helper này KIỂM `{error}` và
//   fallback `scope:'local'` để CHẮC CHẮN xoá session cục bộ trước khi điều hướng.
//   INVARIANT: KHÔNG broadcast token; server vẫn là nguồn thẩm quyền (global revoke khi được).
// ============================================================

type SignOutResult = { error: unknown }
type SignOutFn = (opts?: { scope?: 'global' | 'local' | 'others' }) => Promise<SignOutResult>

// PURE core (unit-testable): global signOut → nếu trả {error} HOẶC throw → fallback local. Trả fellBack.
export async function runCheckedSignOut(signOut: SignOutFn): Promise<{ fellBack: boolean }> {
  let fellBack = false
  try {
    const { error } = await signOut({ scope: 'global' })
    if (error) {
      fellBack = true
      try { await signOut({ scope: 'local' }) } catch { /* hết cách — điều hướng vẫn diễn ra */ }
    }
  } catch {
    fellBack = true
    try { await signOut({ scope: 'local' }) } catch { /* hết cách */ }
  }
  return { fellBack }
}

// Wrapper UI: client thật + invalidate header cache (broadcast cross-tab bên trong — UI-002). KHÔNG điều
//   hướng (caller tự chọn đích: '/', '/login', '/login?reason=idle'). Dynamic import → PURE core ở trên
//   vẫn import được trong test Node (không kéo theo browser client).
export async function performLogout(client?: SupabaseClient): Promise<{ fellBack: boolean }> {
  const supabase = client ?? (await import('@/lib/supabase/client')).createClient()
  const res = await runCheckedSignOut((opts) => supabase.auth.signOut(opts) as Promise<SignOutResult>)
  const { invalidateHeaderProfile } = await import('@/lib/auth/client-profile')
  invalidateHeaderProfile()
  return res
}
