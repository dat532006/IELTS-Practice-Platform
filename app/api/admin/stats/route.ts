import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'

// GET /api/admin/stats — số liệu thật cho dashboard admin (2026-07-12).
// 1 RPC service_role (admin_dashboard_stats) — KHÔNG bịa số, KHÔNG expose cho non-admin.
export async function GET() {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_dashboard_stats')
  if (error || !data) return fail('INTERNAL', 'Không tải được thống kê', { status: 500 })
  return ok(data as Record<string, number>)
}
