import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { createTest, updateTest, type AdminTestOutcome } from '@/lib/admin/tests'
import { ok, fail } from '@/lib/api/response'

// POST/PATCH /api/admin/tests — Admin test CRUD + answer-key split (M11, W12).
// LUẬT THÉP: requireAdmin server-side TRƯỚC mọi mutation; đáp án → answer_keys (KHÔNG vào tests.questions/response).
function mapFail(res: Extract<AdminTestOutcome, { ok: false }>) {
  if (res.code === 'VALIDATION_ERROR') return fail('VALIDATION_ERROR', res.detail ?? 'Dữ liệu đề không hợp lệ', { status: 400 })
  if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })
  return fail('INTERNAL', 'Không lưu được đề', { status: 500 })
}

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await createTest(createAdminClient(), raw)
  if (!res.ok) return mapFail(res)
  return ok({ test_id: res.test_id, status: res.status }, { status: 201 })
}

export async function PATCH(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }

  const res = await updateTest(createAdminClient(), raw)
  if (!res.ok) return mapFail(res)
  return ok({ test_id: res.test_id, status: res.status })
}
