import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { listUsers } from '@/lib/admin/users'
import { ok, fail } from '@/lib/api/response'

// GET /api/admin/users — danh sách tài khoản (M11 mở rộng, 2026-07-12).
// LUẬT THÉP: requireAdmin TRƯỚC service_role; DTO nghiệp vụ (email/name/coins/role) — KHÔNG token/secret.
export async function GET(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const sp = new URL(request.url).searchParams
  try {
    const res = await listUsers(createAdminClient(), {
      q: sp.get('q') ?? undefined,
      page: Number(sp.get('page')) || undefined,
      perPage: Number(sp.get('per_page')) || undefined,
    })
    return ok(res)
  } catch {
    return fail('INTERNAL', 'Không tải được danh sách người dùng', { status: 500 })
  }
}
