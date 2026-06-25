import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { getTestPreview } from '@/lib/admin/tests'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// GET /api/admin/tests/[id]/preview — Admin-only full preview (passages/questions + answer_keys).
// LUẬT THÉP: requireAdmin TRƯỚC; đây là kênh admin riêng (KHÔNG phải /api/exam). Non-admin → 403.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })

  const res = await getTestPreview(createAdminClient(), id)
  if (!res.ok) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })
  return ok({ test: res.test, answer_keys: res.answer_keys })
}
