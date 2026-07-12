import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { setTestMeta, deleteTestTwoTier } from '@/lib/admin/tests'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'

// PATCH/DELETE /api/admin/tests/[id] — meta toggle + xóa đề 2 tầng (M11, 2026-07-12).
// LUẬT THÉP: requireAdmin TRƯỚC service_role. PATCH ở đây là META-ONLY (is_free) — sửa nội dung
//   đề vẫn đi PATCH /api/admin/tests (full body, answer-key split). DELETE: draft chưa ai làm →
//   xóa cứng; còn lại → status='hidden' (học viên cũ giữ nguyên kết quả — Owner quyết 2026-07-12).

const MetaBody = z.object({ is_free: z.boolean() }).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = MetaBody.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Chỉ hỗ trợ field is_free (boolean)', { status: 400 })

  const res = await setTestMeta(createAdminClient(), id, parsed.data)
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })
    if (res.code === 'VALIDATION_ERROR') return fail('VALIDATION_ERROR', res.detail ?? 'Dữ liệu không hợp lệ', { status: 400 })
    return fail('INTERNAL', 'Không cập nhật được đề', { status: 500 })
  }
  return ok({ test_id: res.test_id, status: res.status })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })

  const res = await deleteTestTwoTier(createAdminClient(), id)
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })
    return fail('INTERNAL', 'Không xóa được đề', { status: 500 })
  }
  return ok({ test_id: id, action: res.action })
}
