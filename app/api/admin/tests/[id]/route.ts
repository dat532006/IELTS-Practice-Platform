import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { setTestMeta, deleteTestTwoTier } from '@/lib/admin/tests'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'
import { isAllowedPublicMediaUrl } from '@/lib/storage/media-url'

// PATCH/DELETE /api/admin/tests/[id] — meta toggle + xóa đề 2 tầng (M11, 2026-07-12).
// LUẬT THÉP: requireAdmin TRƯỚC service_role. PATCH ở đây là META-ONLY (is_free) — sửa nội dung
//   đề vẫn đi PATCH /api/admin/tests (full body, answer-key split). DELETE: draft chưa ai làm →
//   xóa cứng; còn lại → status='hidden' (học viên cũ giữ nguyên kết quả — Owner quyết 2026-07-12).

// Meta-only: is_free (toggle) và/hoặc cover_image (URL ảnh minh họa; null = gỡ ảnh). Cần ≥1 field.
// STORE-003 — cover_image: null (gỡ ảnh) HOẶC URL ảnh công khai thuộc allowlist origin (Supabase Storage
//   public / CDN Owner duyệt). Chặn javascript:/data:/host lạ/tracker — trước đây .url() nhận tất cả.
const MetaBody = z
  .object({
    is_free: z.boolean().optional(),
    cover_image: z
      .string()
      .trim()
      .max(1000)
      .refine(isAllowedPublicMediaUrl, { message: 'cover_image phải là URL ảnh công khai hợp lệ (origin được duyệt)' })
      .nullable()
      .optional(),
    // Khung hiển thị ảnh bìa (migration 20260726000100) — chỉ là số, không đụng file ảnh.
    //   Chặn ở đây ĐÚNG bằng CHECK constraint trong DB để lỗi trả 400 thay vì 500.
    cover_pos_x: z.number().int().min(0).max(100).optional(),
    cover_pos_y: z.number().int().min(0).max(100).optional(),
    cover_zoom: z.number().int().min(100).max(300).optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Cần ít nhất một field: is_free, cover_image hoặc cover_pos_x/cover_pos_y/cover_zoom',
  })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = MetaBody.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Chỉ hỗ trợ is_free (boolean), cover_image (URL|null), cover_pos_x/cover_pos_y (0–100), cover_zoom (100–300)', { status: 400 })

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
