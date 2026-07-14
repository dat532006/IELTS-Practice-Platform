import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { signR2PutUrl } from '@/lib/storage/r2'
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
    // set audio_key (server-only column; client deny — check20) nếu gắn với test.
    if (test_id) {
      const { error } = await admin.from('tests').update({ audio_key: objectKey }).eq('id', test_id)
      if (error) return fail('INTERNAL', 'Không gán audio_key', { status: 500 })
    }
    // SEC-004 — KHÔNG trả raw audio_key (định danh storage riêng tư) ra client, kể cả admin: lộ topology
    //   private không cần thiết. Client chỉ cần upload_url để PUT; audio_key do server quản lý.
    //   (STORE-002 finalize-after-verify là follow-up khi có R2 config — xem FIX_LOG.)
    return ok({ method: 'PUT', upload_url: signed.url })
  }

  // image → Supabase Storage signed upload URL. Thiếu bucket → STORAGE_NOT_CONFIGURED.
  //   Trả thêm bucket + public_url (bucket public) để client upload rồi lưu cover_image qua PATCH đề.
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'media'
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(objectKey)
  if (error || !data) return fail('STORAGE_NOT_CONFIGURED', 'Supabase Storage bucket chưa cấu hình (image upload)', { status: 503 })
  const publicUrl = admin.storage.from(bucket).getPublicUrl(data.path).data.publicUrl
  return ok({ method: 'PUT', upload_url: data.signedUrl, path: data.path, token: data.token, bucket, public_url: publicUrl })
}
