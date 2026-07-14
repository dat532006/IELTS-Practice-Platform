import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { ok, fail } from '@/lib/api/response'

// GET /api/admin/payments/exceptions?status=open — PAY-004: danh sách case đối soát (lệch tiền…).
// LUẬT THÉP: requireAdmin TRƯỚC service_role. payment_exceptions RLS deny client → chỉ admin đọc qua service_role.
//   KHÔNG trả secret/PII thô (detail chỉ chứa số tiền). Chỉ đọc; giải quyết qua route resolve riêng.
export async function GET(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res

  const status = new URL(request.url).searchParams.get('status')
  const admin = createAdminClient()
  let query = admin
    .from('payment_exceptions')
    .select('id, provider, provider_txn_id, kind, paid_vnd, expected_vnd, user_id, status, resolution_note, resolved_by, resolved_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status === 'open' || status === 'resolved' || status === 'ignored') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return fail('INTERNAL', 'Không tải được danh sách đối soát', { status: 500 })
  return ok({ items: data ?? [] })
}
