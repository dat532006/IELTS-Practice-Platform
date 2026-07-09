import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSignedAudioUrl, hasTestUnlock } from '@/lib/exam/access'
import { ok, fail } from '@/lib/api/response'
import { isUuid } from '@/lib/utils'
import { sanitizePassages } from '@/lib/sanitize/passage-html'
import type { ExamPayload, ExamSkill } from '@/types/exam'

// Metadata đủ để guard — cột public (RLS published-only). KHÔNG có passages/questions ở bước này.
type TestMetaRow = { id: string; title: string; type: ExamSkill; is_free: boolean }
// Premium payload — đọc bằng service_role CHỈ SAU khi guard pass (giảm blast radius).
// audio_key = raw R2 object key (server-only) → chỉ dùng để ký signed URL, KHÔNG trả client.
type TestPayloadRow = { passages: unknown; questions: unknown; audio_key: string | null }

// GET /api/exam/[id] — EXAM PAYLOAD GATE (M05/M03).
// LUẬT THÉP #3: chỉ trả passages/questions/audio khi is_free HOẶC user có test_unlocks.
//   (product_unlocks KHÔNG mở payload — đã expand sang test_unlocks lúc mua, M08.)
// LUẬT THÉP #2: KHÔNG bao giờ kèm answer_keys (không query bảng đó).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!isUuid(id)) return fail('NOT_FOUND', 'Không tìm thấy đề thi', { status: 404 })
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // 1) Metadata qua RLS client (published-only; passages/questions KHÔNG grant → không thể chạm ở bước này).
    const { data, error } = await supabase
      .from('tests')
      .select('id, title, type, is_free')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const test = data as unknown as TestMetaRow | null
    if (!test) return fail('NOT_FOUND', 'Không tìm thấy đề thi', { status: 404 })

    // 2) 🔒 GUARD (LUẬT THÉP #3): is_free HOẶC test_unlocks của user (đọc qua RLS client của chính user).
    const unlocked = test.is_free || (await hasTestUnlock(supabase, test.id, user?.id ?? null))
    if (!unlocked) {
      return fail('EXAM_LOCKED', 'Đề thi này cần được mở khóa trước khi làm bài', { status: 403 })
    }

    // 3) CHỈ SAU khi guard pass mới đọc premium payload bằng service_role (gồm audio_key server-only).
    const admin = createAdminClient()
    const { data: payloadData, error: pErr } = await admin
      .from('tests')
      .select('passages, questions, audio_key')
      .eq('id', test.id)
      .maybeSingle()
    if (pErr) throw new Error(pErr.message)
    const payloadRow = (payloadData ?? {}) as unknown as TestPayloadRow

    // Audio Listening: ký signed URL trong nhánh đã pass guard. audio_key KHÔNG ra client.
    // Thiếu R2 env / thiếu key → audio_url=null + warning (exam vẫn chạy; FE xử lý null).
    const { url: audio_url, warning: audioWarning } = getSignedAudioUrl({
      type: test.type,
      audio_key: payloadRow.audio_key ?? null,
    })
    const warnings = audioWarning ? [audioWarning] : []
    const payload: ExamPayload = {
      test: { id: test.id, title: test.title, skill: test.type, is_free: test.is_free },
      // Defense-in-depth: sanitize passage HTML lần nữa trên đường ra client (kể cả data ghi thẳng DB).
      passages: sanitizePassages(payloadRow.passages),
      questions: payloadRow.questions,
      audio_url,
    }
    return ok(payload, { warnings })
  } catch {
    return fail('INTERNAL', 'Không tải được đề thi', { status: 500 })
  }
}
