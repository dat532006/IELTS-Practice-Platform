import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AnswerKeyEntrySchema } from '@/lib/scoring/score-reading'
import { sanitizePassages } from '@/lib/sanitize/passage-html'
import { refreshProductSearch } from '@/lib/admin/product-search'

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
    // Passage rich-text (HTML admin soạn) → sanitize allowlist TRƯỚC khi lưu (không tin markup thô).
    passages: sanitizePassages(input.passages ?? []),
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
  // Đề published sửa type/difficulty/question_types/is_free → cột matview đổi theo.
  if ((data.status as string) === 'published') {
    const refreshed = await refreshProductSearch(admin)
    if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã cập nhật đề nhưng refresh catalog lỗi: ${refreshed.detail}` }
  }
  return { ok: true, test_id: data.id as string, status: data.status as string }
}

// Danh sách đề cho admin (metadata-only — KHÔNG passages/questions/answer_keys) + VOL chứa đề.
//   Filter: q (ilike title/slug), status, type; phân trang. Chỉ gọi sau requireAdmin.
export type AdminTestListItem = {
  id: string
  slug: string | null
  title: string | null
  type: string | null
  is_free: boolean
  status: string
  duration_sec: number | null
  created_at: string
  products: { id: string; title: string | null; slug: string | null }[]
}
export async function listTests(
  admin: SupabaseClient,
  opts: { q?: string; status?: string; type?: string; page?: number; perPage?: number },
): Promise<{ items: AdminTestListItem[]; total: number; page: number; per_page: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.min(200, Math.max(1, opts.perPage ?? 50))
  let query = admin
    .from('tests')
    .select('id, slug, title, type, is_free, status, duration_sec, created_at', { count: 'exact' })
  if (opts.status) query = query.eq('status', opts.status)
  if (opts.type) query = query.eq('type', opts.type)
  if (opts.q) {
    const safe = opts.q.replace(/[%_,()]/g, ' ').trim()
    if (safe) query = query.or(`title.ilike.%${safe}%,slug.ilike.%${safe}%`)
  }
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Omit<AdminTestListItem, 'products'>[]
  const ids = rows.map((r) => r.id)
  const byTest = new Map<string, AdminTestListItem['products']>()
  if (ids.length > 0) {
    const { data: ct } = await admin
      .from('collection_tests')
      .select('test_id, products(id, title, slug)')
      .in('test_id', ids)
    for (const row of (ct ?? []) as unknown as { test_id: string; products: { id: string; title: string | null; slug: string | null } | null }[]) {
      if (!row.products) continue
      const list = byTest.get(row.test_id) ?? []
      list.push(row.products)
      byTest.set(row.test_id, list)
    }
  }
  return {
    items: rows.map((r) => ({ ...r, products: byTest.get(r.id) ?? [] })),
    total: count ?? rows.length,
    page,
    per_page: perPage,
  }
}

// Meta-only update (toggle nhanh từ danh sách + ảnh minh họa) — KHÔNG đụng passages/questions/answer_keys.
//   cover_image: string = set URL ảnh; null = gỡ ảnh; undefined = không đụng.
export async function setTestMeta(
  admin: SupabaseClient,
  testId: string,
  patch: { is_free?: boolean; cover_image?: string | null },
): Promise<AdminTestOutcome> {
  const update: { is_free?: boolean; cover_image?: string | null } = {}
  if (patch.is_free !== undefined) update.is_free = patch.is_free
  if (patch.cover_image !== undefined) update.cover_image = patch.cover_image
  if (Object.keys(update).length === 0) return { ok: false, code: 'VALIDATION_ERROR', detail: 'Không có field nào để cập nhật' }
  const { data, error } = await admin
    .from('tests')
    .update(update)
    .eq('id', testId)
    .select('id, status')
    .maybeSingle()
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  if (!data) return { ok: false, code: 'NOT_FOUND' }
  // is_free của đề published nuôi has_free_test của matview (cover_image thì không).
  if (patch.is_free !== undefined && (data.status as string) === 'published') {
    const refreshed = await refreshProductSearch(admin)
    if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã cập nhật đề nhưng refresh catalog lỗi: ${refreshed.detail}` }
  }
  return { ok: true, test_id: data.id as string, status: data.status as string }
}

// Xóa đề 2 TẦNG (Owner quyết 2026-07-12):
//   - draft + CHƯA có attempt nào → hard delete (dọn dependents: answer_keys/collection_tests/
//     test_unlocks/bookmarks — attempts chắc chắn 0 do điều kiện tầng).
//   - còn lại (published/hidden hoặc đã có người làm) → status='hidden' (soft-hide): biến mất khỏi
//     catalog nhưng attempt/result của học viên cũ GIỮ NGUYÊN. Khôi phục = publish lại.
export type DeleteTestOutcome =
  | { ok: true; action: 'deleted' | 'hidden' }
  | { ok: false; code: 'NOT_FOUND' | 'INTERNAL'; detail?: string }
export async function deleteTestTwoTier(admin: SupabaseClient, testId: string): Promise<DeleteTestOutcome> {
  const { data: t, error: tErr } = await admin.from('tests').select('id, status').eq('id', testId).maybeSingle()
  if (tErr) return { ok: false, code: 'INTERNAL', detail: tErr.message }
  if (!t) return { ok: false, code: 'NOT_FOUND' }

  const { count, error: cErr } = await admin
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('test_id', testId)
  if (cErr) return { ok: false, code: 'INTERNAL', detail: cErr.message }

  const attempts = count ?? 0
  if ((t as { status: string }).status === 'draft' && attempts === 0) {
    for (const table of ['answer_keys', 'collection_tests', 'test_unlocks', 'bookmarks'] as const) {
      const { error } = await admin.from(table).delete().eq('test_id', testId)
      if (error) return { ok: false, code: 'INTERNAL', detail: `${table}: ${error.message}` }
    }
    const { error } = await admin.from('tests').delete().eq('id', testId)
    if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
    return { ok: true, action: 'deleted' }
  }

  const { error } = await admin.from('tests').update({ status: 'hidden' }).eq('id', testId)
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  // Luôn refresh cả khi test đã hidden: retry sẽ tự chữa lần hide trước ghi thành công
  // nhưng refresh thất bại.
  const refreshed = await refreshProductSearch(admin)
  if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã ẩn đề nhưng refresh catalog lỗi: ${refreshed.detail}` }
  return { ok: true, action: 'hidden' }
}

// Preview admin-only: full test + answer_keys (kênh riêng, KHÔNG phải /api/exam). Chỉ gọi sau requireAdmin.
export async function getTestPreview(admin: SupabaseClient, testId: string) {
  const { data: test } = await admin
    .from('tests')
    .select('id, slug, title, type, source, is_free, difficulty, duration_sec, question_types, passages, questions, status, audio_key, cover_image, created_at')
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
  // Đề vừa published bắt đầu được matview đếm (skills/test_count của VOL chứa nó).
  const refreshed = await refreshProductSearch(admin)
  if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã publish đề nhưng refresh catalog lỗi: ${refreshed.detail}` }
  return { ok: true, test_id: data.id as string, status: data.status as string }
}
