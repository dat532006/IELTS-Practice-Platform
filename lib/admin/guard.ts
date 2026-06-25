import 'server-only'
import type { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/guards'
import { fail } from '@/lib/api/response'

// W12 — Admin API guard wrapper (M11). Mọi /api/admin/* gọi đầu route.
// LUẬT THÉP: role check Ở SERVER (không chỉ ẩn UI). 401 nếu chưa đăng nhập, 403 nếu không phải admin.
//   Mutation/preview qua service_role CHỈ SAU khi guard pass.
export async function requireAdminApi(): Promise<
  { ok: true; userId: string } | { ok: false; res: NextResponse }
> {
  const r = await requireAdmin()
  if (!r.ok) {
    return r.reason === 'UNAUTHORIZED'
      ? { ok: false, res: fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 }) }
      : { ok: false, res: fail('FORBIDDEN', 'Chỉ admin được phép thao tác này', { status: 403 }) }
  }
  return { ok: true, userId: r.user.id }
}
