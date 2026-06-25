import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { publishTest } from '@/lib/admin/tests'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// POST /api/admin/tests/[id]/publish — draft→published (M11, W12). requireAdmin TRƯỚC.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })

  const res = await publishTest(createAdminClient(), id)
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })
    return fail('INTERNAL', 'Không publish được đề', { status: 500 })
  }
  return ok({ test_id: res.test_id, status: res.status })
}
