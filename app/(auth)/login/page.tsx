import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/auth/LoginForm'
import { safeNextPath } from '@/lib/utils'

// Honor `?next=` (vd guest bấm Start → /login?next=/exam/[id]). Sanitize server-side (chống open-redirect).
// 2026-07-13: ĐÃ đăng nhập mà vào /login → chuyển thẳng tới next (đã sanitize) / dashboard,
//   không hiện form đăng nhập thừa (cùng lớp guard với /register).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const sp = await searchParams
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect(safeNextPath(raw, '/dashboard'))
  return <LoginForm next={safeNextPath(raw)} />
}
