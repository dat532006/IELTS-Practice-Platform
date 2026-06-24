import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'
import { AnswersSchema } from '@/lib/exam/answers'

// POST /api/attempts/[id]/answers — autosave draft answers (M05, W9).
// LUẬT THÉP #2/#12: lưu answer THÔ của owner (chống mất bài reload); KHÔNG đụng answer_keys/raw_score/band/status.
//   - owner-only; attempts WRITE qua service_role sau owner guard (RLS deny client write).
//   - CHỈ ghi khi status='in_progress' (conditional update) → KHÔNG ghi đè answers đã nộp / không hồi sinh attempt terminal.
//   - Tách khỏi route annotations (annotations CHỈ highlights/bookmarked_qs theo design).

const MAX_ANSWERS_BYTES = 64 * 1024

const BodySchema = z.object({ answers: AnswersSchema })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy bài làm', { status: 404 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

    const raw = await request.json().catch(() => null)
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu câu trả lời không hợp lệ', { status: 400 })
    const { answers } = parsed.data

    if (JSON.stringify(answers).length > MAX_ANSWERS_BYTES)
      return fail('VALIDATION_ERROR', 'Câu trả lời vượt quá kích thước cho phép', { status: 400 })

    const admin = createAdminClient()
    // Owner guard — KHÔNG lộ tồn tại attempt người khác.
    const { data: a, error: aErr } = await admin
      .from('attempts')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle()
    if (aErr) throw new Error(aErr.message)
    const row = a as { id: string; user_id: string; status: string } | null
    if (!row || row.user_id !== user.id) return fail('NOT_FOUND', 'Không tìm thấy bài làm', { status: 404 })
    if (row.status !== 'in_progress')
      return fail('ATTEMPT_TERMINAL', 'Bài đã nộp, không thể lưu thêm câu trả lời', { status: 409 })

    // Conditional update: chỉ ghi khi vẫn in_progress (chống race với submit/auto-submit).
    const { data: upd, error: uErr } = await admin
      .from('attempts')
      .update({ answers })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .select('id')
      .maybeSingle()
    if (uErr) throw new Error(uErr.message)
    if (!upd) return fail('ATTEMPT_TERMINAL', 'Bài đã nộp, không thể lưu thêm câu trả lời', { status: 409 })

    return ok({ attempt_id: id, saved: true })
  } catch {
    return fail('INTERNAL', 'Không lưu được câu trả lời', { status: 500 })
  }
}
