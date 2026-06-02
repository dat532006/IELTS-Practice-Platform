import { LoginForm } from '@/components/auth/LoginForm'
import { safeNextPath } from '@/lib/utils'

// Honor `?next=` (vd guest bấm Start → /login?next=/exam/[id]). Sanitize server-side (chống open-redirect).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const sp = await searchParams
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next
  return <LoginForm next={safeNextPath(raw)} />
}
