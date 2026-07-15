import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { signR2PutUrl } from '@/lib/storage/r2'
import { sealUploadRef } from '@/lib/storage/upload-ref'
import { ok, fail } from '@/lib/api/response'

// POST /api/admin/media — admin upload presign (M03/M11, W12). requireAdmin TRƯỚC.
//   image → Supabase Storage signed upload URL; audio → R2 PUT presign → set tests.audio_key.
// 🔐 R2/secret server-only; presigned URL có TTL ngắn, KHÔNG chứa secret. Thiếu infra → STORAGE_NOT_CONFIGURED (KHÔNG crash).
const MediaSchema = z.object({
  kind: z.enum(['image', 'audio']),
  filename: z.string().min(1).max(200),
  content_type: z.string().max(120).optional(),
  test_id: z.string().uuid().optional(),
})

// Tên object an toàn: bỏ path separator + ký tự lạ.
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  let raw: unknown
  try { raw = await request.json() } catch { return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 }) }
  const parsed = MediaSchema.safeParse(raw)
  if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu media không hợp lệ', { status: 400 })

  const { kind, filename, test_id } = parsed.data
  const scope = test_id ?? 'unsorted'
  const objectKey = `${kind === 'audio' ? 'audio' : 'images'}/${scope}/${Date.now()}-${safeName(filename)}`
  const admin = createAdminClient()

  if (kind === 'audio') {
    // R2 PUT presign (server-only secret). Thiếu R2 env → R2_NOT_CONFIGURED.
    const signed = signR2PutUrl(objectKey)
    if (!signed.url) return fail('STORAGE_NOT_CONFIGURED', 'R2 chưa được cấu hình (audio upload)', { status: 503 })
    // STORE-002 — KHÔNG set audio_key ở đây: object CHƯA được PUT → key sẽ trỏ object không tồn tại. Thay vào
    //   đó trả upload_ref (AES-GCM MÃ HÓA objectKey, KHÔNG lộ raw key ra client — SEC-004). Client PUT xong gọi
    //   /api/admin/media/finalize → server HEAD verify object tồn tại → MỚI set tests.audio_key.
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) return fail('STORAGE_NOT_CONFIGURED', 'Server chưa cấu hình', { status: 503 })
    const upload_ref = sealUploadRef(objectKey, secret)
    return ok({ method: 'PUT', upload_url: signed.url, upload_ref })
  }

  // image → Supabase Storage signed upload URL. Thiếu bucket → STORAGE_NOT_CONFIGURED.
  //   Trả thêm bucket + public_url (bucket public) để client upload rồi lưu cover_image qua PATCH đề.
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'media'
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(objectKey)
  if (error || !data) return fail('STORAGE_NOT_CONFIGURED', 'Supabase Storage bucket chưa cấu hình (image upload)', { status: 503 })
  const publicUrl = admin.storage.from(bucket).getPublicUrl(data.path).data.publicUrl
  return ok({ method: 'PUT', upload_url: data.signedUrl, path: data.path, token: data.token, bucket, public_url: publicUrl })
}
