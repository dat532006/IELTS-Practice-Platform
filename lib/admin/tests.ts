import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AnswerKeyEntrySchema } from '@/lib/scoring/score-reading'

// ============================================================
// W12 — Admin test content orchestration (M11/M05). SERVER-ONLY.
// LUẬT THÉP #2: đáp án CHỈ vào answer_keys.keys, KHÔNG vào tests.questions, KHÔNG ra client.
//   Mọi mutation chạy bằng service_role (admin client) SAU requireAdmin (route lo guard).
//   Validate question shape + answer key shape (AnswerKeyEntrySchema) trước khi lưu.
// ============================================================

// Question = freeform jsonb nhưng BẮT BUỘC có id; các field mang đáp án bị STRIP trước khi lưu.
const QuestionSchema = z.object({ id: z.string().min(1).max(80) }).passthrough()

export const TestInputSchema = z.object({
  id: z.string().uuid().optional(), // PATCH theo id
  title: z.string().min(1).max(300),
  type: z.enum(['reading', 'listening', 'writing']),
  slug: z.string().min(1).max(200).optional(),
  source: z.string().max(1000).optional(),
  is_free: z.boolean().optional(),
  difficulty: z.number().int().min(1).max(9).optional(),
  duration_sec: z.number().int().positive().max(36000).optional(),
  question_types: z.array(z.string().max(60)).max(50).optional(),
  passages: z.array(z.record(z.unknown())).max(50).optional(),
  questions: z.array(QuestionSchema).max(300),
  // qid → answer key entry. Mỗi entry validate strict (reject đáp án sai cấu trúc). Optional cho writing.
  answer_keys: z.record(AnswerKeyEntrySchema).optional(),
})
export type TestInput = z.infer<typeof TestInputSchema>

export type AdminTestOutcome =
  | { ok: true; test_id: string; status: string }
  | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL'; detail?: string }

// Field có thể mang đáp án — STRIP khỏi questions trước khi lưu (chống đáp án lọt premium payload).
const ANSWER_FIELDS = ['answer', 'answers', 'correct', 'correct_answer', 'correctAnswer', 'solution', 'key']
function stripAnswerFields(q: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(q)) {
    if (ANSWER_FIELDS.includes(k)) continue
    out[k] = v
  }
  return out
}

function buildRow(input: TestInput) {
  return {
    title: input.title,
    type: input.type,
    slug: input.slug ?? null,
    source: input.source ?? null,
    is_free: input.is_free ?? false,
    difficulty: input.difficulty ?? null,
    duration_sec: input.duration_sec ?? null,
    question_types: input.question_types ?? null,
    passages: input.passages ?? [],
    questions: input.questions.map((q) => stripAnswerFields(q as Record<string, unknown>)),
  }
}

// Tạo đề mới (status=draft). Trả test_id + status — KHÔNG bao giờ trả keys.
export async function createTest(admin: SupabaseClient, raw: unknown): Promise<AdminTestOutcome> {
  const parsed = TestInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }

  const { data, error } = await admin
    .from('tests')
    .insert({ ...buildRow(parsed.data), status: 'draft' })
    .select('id, status')
    .single()
  if (error || !data) return { ok: false, code: 'INTERNAL', detail: error?.message }

  if (parsed.data.answer_keys) {
    const { error: kErr } = await admin
      .from('answer_keys')
      .upsert({ test_id: data.id, keys: parsed.data.answer_keys })
    if (kErr) return { ok: false, code: 'INTERNAL', detail: kErr.message }
  }
  return { ok: true, test_id: data.id as string, status: data.status as string }
}

// Sửa đề theo id (upsert, KHÔNG xóa). answer_keys upsert nếu có. KHÔNG trả keys.
export async function updateTest(admin: SupabaseClient, raw: unknown): Promise<AdminTestOutcome> {
  const parsed = TestInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }
  if (!parsed.data.id) return { ok: false, code: 'VALIDATION_ERROR', detail: 'id bắt buộc khi PATCH' }

  const { data, error } = await admin
    .from('tests')
    .update(buildRow(parsed.data))
    .eq('id', parsed.data.id)
    .select('id, status')
    .single()
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  if (!data) return { ok: false, code: 'NOT_FOUND' }

  if (parsed.data.answer_keys) {
    const { error: kErr } = await admin
      .from('answer_keys')
      .upsert({ test_id: parsed.data.id, keys: parsed.data.answer_keys })
    if (kErr) return { ok: false, code: 'INTERNAL', detail: kErr.message }
  }
  return { ok: true, test_id: data.id as string, status: data.status as string }
}

// Preview admin-only: full test + answer_keys (kênh riêng, KHÔNG phải /api/exam). Chỉ gọi sau requireAdmin.
export async function getTestPreview(admin: SupabaseClient, testId: string) {
  const { data: test } = await admin
    .from('tests')
    .select('id, slug, title, type, source, is_free, difficulty, duration_sec, question_types, passages, questions, status, audio_key, created_at')
    .eq('id', testId)
    .maybeSingle()
  if (!test) return { ok: false as const, code: 'NOT_FOUND' as const }
  const { data: ak } = await admin.from('answer_keys').select('keys').eq('test_id', testId).maybeSingle()
  return { ok: true as const, test, answer_keys: ak?.keys ?? null }
}

// Publish draft→published. Trả status mới.
// R4 (review hardening): reading/listening PHẢI có answer_keys hợp lệ TRƯỚC khi publish.
//   Đề published là attemptable (is_free | unlocked); thiếu keys → submit chấm ra raw_score=null
//   (ANSWER_KEYS_MISSING) — đề "hỏng" hiển thị/bán được mà KHÔNG có lớp nào đỡ. Writing KHÔNG cần keys
//   (chấm bằng AI). (KHÁC bundle-có-test-draft: đó là incremental release cố ý, test draft bị RLS ẩn.)
export async function publishTest(admin: SupabaseClient, testId: string): Promise<AdminTestOutcome> {
  const { data: t, error: tErr } = await admin.from('tests').select('type').eq('id', testId).maybeSingle()
  if (tErr) return { ok: false, code: 'INTERNAL', detail: tErr.message }
  if (!t) return { ok: false, code: 'NOT_FOUND' }
  const testType = (t as { type?: string }).type
  if (testType === 'reading' || testType === 'listening') {
    const { data: ak } = await admin.from('answer_keys').select('keys').eq('test_id', testId).maybeSingle()
    const keys = (ak as { keys?: unknown } | null)?.keys
    const hasKeys =
      keys != null && typeof keys === 'object' && Object.keys(keys as Record<string, unknown>).length > 0
    if (!hasKeys) {
      return { ok: false, code: 'VALIDATION_ERROR', detail: 'Đề reading/listening cần answer_keys hợp lệ trước khi publish' }
    }
  }

  const { data, error } = await admin
    .from('tests')
    .update({ status: 'published' })
    .eq('id', testId)
    .select('id, status')
    .single()
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  if (!data) return { ok: false, code: 'NOT_FOUND' }
  return { ok: true, test_id: data.id as string, status: data.status as string }
}
