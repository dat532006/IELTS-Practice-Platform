import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'

// POST /api/admin/payments/reconcile — dọn topup pending quá hạn (M08, W16 G9).
// LUẬT THÉP: requireAdmin TRƯỚC (server-side role check), rồi mới gọi service_role RPC.
//   expire_pending_topups: pending + expires_at < now() → status='failed'. KHÔNG cộng coin (credit chỉ ở webhook).
//   Idempotent: chỉ đụng pending quá hạn → chạy lại nhiều lần an toàn. Có thể gọi từ cron/job ngoài.
export async function POST() {
  const g = await requireAdminApi()
  if (!g.ok) return g.res

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('expire_pending_topups')
  if (error) return fail('INTERNAL', 'Không dọn được giao dịch quá hạn', { status: 500 })

  const expired = (data as { expired?: number } | null)?.expired ?? 0
  return ok({ expired })
}
