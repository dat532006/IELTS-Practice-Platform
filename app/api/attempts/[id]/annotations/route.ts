import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'
import { HighlightsSchema } from '@/lib/exam/highlights'

// POST /api/attempts/[id]/annotations — persist annotation cá nhân (M05/M09).
// LUẬT THÉP: owner-only; attempts WRITE qua service_role (RLS deny client write) sau owner guard.
//   CHỈ set highlights / bookmarked_qs (KHÔNG answers/raw_score/band/status — không qua route này).
//   FIX P1/P2: highlights validate bằng STRICT anchor schema (reject key lạ vd answer_keys/points/match)
//   → user KHÔNG nhồi được forbidden key vào highlights để rò qua GET /api/result.

const MAX_HIGHLIGHTS_BYTES = 32 * 1024 // ~32KB serialize guard (bổ sung ngoài giới hạn per-field)

const BodySchema = z
  .object({
    highlights: HighlightsSchema.optional(), // strict anchor: id/startPath/startOffset/endPath/endOffset/quote/color/note/createdAt
    bookmarked_qs: z.array(z.string().min(1).max(64)).max(200).optional(),
  })
  .refine((b) => b.highlights !== undefined || b.bookmarked_qs !== undefined, {
    message: 'Cần ít nhất highlights hoặc bookmarked_qs',
  })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy bài làm', { status: 404 })

    const supabase = await createClient()
    const user = await getAuthedUser(supabase)
    if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

    const raw = await request.json().catch(() => null)
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu annotation không hợp lệ', { status: 400 })
    const body = parsed.data

    if (body.highlights !== undefined && JSON.stringify(body.highlights).length > MAX_HIGHLIGHTS_BYTES) {
      return fail('VALIDATION_ERROR', 'Highlights vượt quá kích thước cho phép', { status: 400 })
    }

    const admin = createAdminClient()
    // Owner guard — KHÔNG lộ tồn tại attempt người khác.
    const { data: a, error: aErr } = await admin
      .from('attempts')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle()
    if (aErr) throw new Error(aErr.message)
    if (!a || (a as { user_id: string }).user_id !== user.id)
      return fail('NOT_FOUND', 'Không tìm thấy bài làm', { status: 404 })

    // Partial update: chỉ field có trong body. bookmarked_qs dedupe.
    const patch: Record<string, unknown> = {}
    if (body.highlights !== undefined) patch.highlights = body.highlights
    if (body.bookmarked_qs !== undefined) patch.bookmarked_qs = Array.from(new Set(body.bookmarked_qs))

    const { data: upd, error: uErr } = await admin
      .from('attempts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, highlights, bookmarked_qs')
      .maybeSingle()
    if (uErr) throw new Error(uErr.message)
    if (!upd) return fail('NOT_FOUND', 'Không tìm thấy bài làm', { status: 404 })

    const row = upd as { id: string; highlights: unknown; bookmarked_qs: unknown }
    return ok({
      attempt_id: row.id,
      highlights: row.highlights ?? null,
      bookmarked_qs: Array.isArray(row.bookmarked_qs) ? row.bookmarked_qs : [],
    })
  } catch {
    return fail('INTERNAL', 'Không lưu được annotation', { status: 500 })
  }
}
