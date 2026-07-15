import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { openUploadRef } from '@/lib/storage/upload-ref'
import { r2ObjectExists } from '@/lib/storage/r2'
import { ok, fail } from '@/lib/api/response'

// POST /api/admin/media/finalize — STORE-002: chốt audio_key SAU khi verify object THẬT tồn tại trên R2.
// Flow: /api/admin/media (audio) presign PUT + trả upload_ref → client PUT file → gọi finalize {test_id,
//   upload_ref} → giải mã ref (AES-GCM, lấy objectKey, KHÔNG cần state DB) → HEAD R2 → tồn tại thì set audio_key.
// LUẬT THÉP: requireAdmin TRƯỚC. upload_ref opaque (SEC-004: client không thấy raw audio_key). Bind test_id:
//   objectKey PHẢI thuộc scope `audio/{test_id}/` → không dùng ref của test khác. Object chưa upload → 400
//   (KHÔNG set key trỏ object rỗng). Thiếu R2 → STORAGE_NOT_CONFIGURED.
const FinalizeSchema = z.object({
  test_id: z.string().uuid(),
  upload_ref: z.string().min(1).max(2000),
})

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res

  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = FinalizeSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu finalize không hợp lệ', { status: 400 })
  const { test_id, upload_ref } = parsed.data

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return fail('STORAGE_NOT_CONFIGURED', 'Server chưa cấu hình', { status: 503 })

  const objectKey = openUploadRef(upload_ref, secret)
  if (!objectKey) return fail('VALIDATION_ERROR', 'upload_ref không hợp lệ', { status: 400 })
  // Bind ref ↔ test: object phải thuộc scope của đúng test (chống dùng ref test khác gán chéo).
  if (!objectKey.startsWith(`audio/${test_id}/`)) return fail('VALIDATION_ERROR', 'upload_ref không khớp đề', { status: 400 })

  // STORE-002 — verify object THẬT tồn tại trên R2 (HEAD) TRƯỚC khi set key.
  const head = await r2ObjectExists(objectKey)
  if (!head.configured) return fail('STORAGE_NOT_CONFIGURED', 'R2 chưa được cấu hình', { status: 503 })
  if (!head.exists) return fail('VALIDATION_ERROR', 'Chưa thấy file đã upload — hãy PUT file trước khi finalize', { status: 400 })

  // Object tồn tại → set audio_key (server-only column; client deny). KHÔNG trả raw key ra client (SEC-004).
  const admin = createAdminClient()
  const { data, error } = await admin.from('tests').update({ audio_key: objectKey }).eq('id', test_id).select('id').maybeSingle()
  if (error) return fail('INTERNAL', 'Không gán audio_key', { status: 500 })
  if (!data) return fail('NOT_FOUND', 'Không tìm thấy đề', { status: 404 })
  return ok({ finalized: true })
}
