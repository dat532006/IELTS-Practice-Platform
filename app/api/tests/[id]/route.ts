import { createClient } from '@/lib/supabase/server'
import { getTestMeta } from '@/lib/exam/meta'
import { ok, fail } from '@/lib/api/response'

// GET /api/tests/[id] — pre-exam metadata an toàn cho /tests/[id] (M04/M05).
// Query logic ở `lib/exam/meta.ts` (dùng chung với page server component). KHÔNG trả payload.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const meta = await getTestMeta(supabase, id, user?.id ?? null)
    if (!meta) return fail('NOT_FOUND', 'Không tìm thấy đề thi', { status: 404 })
    return ok(meta)
  } catch {
    return fail('INTERNAL', 'Không tải được thông tin đề thi', { status: 500 })
  }
}
