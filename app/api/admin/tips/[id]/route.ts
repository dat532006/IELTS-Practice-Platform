import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { sanitizeTipHtml } from '@/lib/sanitize/tip-html'
import { isAllowedPublicMediaUrl } from '@/lib/storage/media-url'
import { ok, fail } from '@/lib/api/response'
import { TipBody } from '@/lib/tips/schema'

// PATCH /api/admin/tips/[id] — cập nhật bài (mọi field optional). published_at set khi CHUYỂN sang published.
// DELETE /api/admin/tips/[id] — xoá bài. Cả hai: requireAdmin + service_role.
const PatchBody = TipBody.partial()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 })
  }
  const parsed = PatchBody.safeParse(raw)
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', { status: 400 })
  }
  const v = parsed.data

  const admin = createAdminClient()

  // Cần trạng thái hiện tại để quyết định published_at (chỉ đóng dấu khi LẦN ĐẦU published).
  const { data: current, error: curErr } = await admin
    .from('tip_articles')
    .select('status, published_at')
    .eq('id', id)
    .maybeSingle()
  if (curErr) return fail('INTERNAL', 'Không đọc được bài viết', { status: 500 })
  if (!current) return fail('NOT_FOUND', 'Không tìm thấy bài viết', { status: 404 })

  const cur = current as { status: string; published_at: string | null }
  const patch: Record<string, unknown> = {}
  for (const k of ['slug', 'skill', 'type', 'title', 'excerpt', 'author', 'band', 'read_minutes', 'sort_order', 'featured', 'cover_fit', 'cover_height'] as const) {
    if (v[k] !== undefined) patch[k] = v[k]
  }
  if (v.body_html !== undefined) patch.body_html = sanitizeTipHtml(v.body_html)
  if (v.cover_image !== undefined) {
    // '' → gỡ ảnh bìa (null). Có giá trị nhưng URL không hợp lệ → chặn.
    if (v.cover_image === '') patch.cover_image = null
    else if (isAllowedPublicMediaUrl(v.cover_image)) patch.cover_image = v.cover_image
    else return fail('VALIDATION_ERROR', 'Ảnh bìa không hợp lệ', { status: 400 })
  }
  if (v.status !== undefined) {
    patch.status = v.status
    if (v.status === 'published' && cur.published_at == null) patch.published_at = new Date().toISOString()
  }
  if (Object.keys(patch).length === 0) return fail('VALIDATION_ERROR', 'Không có gì để cập nhật', { status: 400 })

  const { data, error } = await admin.from('tip_articles').update(patch).eq('id', id).select('id, slug').single()
  if (error) {
    if (error.code === '23505') return fail('VALIDATION_ERROR', 'slug đã tồn tại — chọn slug khác', { status: 409 })
    return fail('INTERNAL', 'Không cập nhật được bài viết', { status: 500 })
  }
  // Chỉ 1 bài nổi bật: nếu bài này set featured=true → bỏ featured ở tất cả bài khác.
  if (v.featured === true) await admin.from('tip_articles').update({ featured: false }).eq('featured', true).neq('id', id)
  return ok({ id: (data as { id: string }).id, slug: (data as { slug: string }).slug })
}

const DeleteParams = z.object({ id: z.string().uuid('id không hợp lệ') })

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res
  const { id } = await params
  const idParsed = DeleteParams.safeParse({ id })
  if (!idParsed.success) return fail('VALIDATION_ERROR', 'id không hợp lệ', { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('tip_articles').delete().eq('id', id)
  if (error) return fail('INTERNAL', 'Không xoá được bài viết', { status: 500 })
  return ok({ deleted: true })
}
