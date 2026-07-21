import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminApi } from '@/lib/admin/guard'
import { sanitizePassageHtml } from '@/lib/sanitize/passage-html'
import { ok, fail } from '@/lib/api/response'
import { TipBody } from '@/lib/tips/schema'

// POST /api/admin/tips — tạo bài Tips mới. LUẬT THÉP: requireAdmin TRƯỚC; body_html sanitize allowlist
//   trước khi lưu; ghi qua service_role (bypass RLS). slug trùng → 409.
export async function POST(request: Request) {
  const g = await requireAdminApi()
  if (!g.ok) return g.res

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail('VALIDATION_ERROR', 'Body JSON không hợp lệ', { status: 400 })
  }
  const parsed = TipBody.safeParse(raw)
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', { status: 400 })
  }
  const v = parsed.data

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tip_articles')
    .insert({
      slug: v.slug,
      skill: v.skill,
      type: v.type,
      title: v.title,
      excerpt: v.excerpt,
      body_html: sanitizePassageHtml(v.body_html),
      author: v.author,
      band: v.band,
      read_minutes: v.read_minutes,
      status: v.status,
      sort_order: v.sort_order,
      published_at: v.status === 'published' ? new Date().toISOString() : null,
    })
    .select('id, slug')
    .single()

  if (error) {
    if (error.code === '23505') return fail('VALIDATION_ERROR', 'slug đã tồn tại — chọn slug khác', { status: 409 })
    return fail('INTERNAL', 'Không tạo được bài viết', { status: 500 })
  }
  return ok({ id: (data as { id: string }).id, slug: (data as { slug: string }).slug })
}
