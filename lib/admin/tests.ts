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

// ADMIN-001 — ALLOWLIST question schema. Trước đây `.passthrough()` + blacklist top-level: alias đáp án
//   (correct_answers, answer_keys lồng, explanation, evidence, options[].correct…) lọt vào tests.questions
//   → public exam payload. Giờ CHỈ giữ đúng field renderer M06 dùng (types.ts ExamQuestion); mọi field lạ
//   bị STRIP (default zod), option chỉ {key,text}. Đáp án luôn tách sang answer_keys (server-only).
const QOptionSchema = z.object({
  key: z.string().min(1).max(60),
  text: z.string().max(4000).optional(),
})
const QuestionSchema = z.object({
  id: z.string().min(1).max(80),
  number: z.number().int().min(0).max(1000).optional(),
  type: z.string().max(60).optional(),
  instruction: z.string().max(8000).optional(),
  passage_id: z.string().max(80).optional(),
  section_id: z.string().max(80).optional(),
  prompt: z.string().max(20000).optional(),
  statement: z.string().max(20000).optional(),
  options: z.array(QOptionSchema).max(30).optional(),
  select_count: z.number().int().min(1).max(20).optional(),
  image: z.string().max(3_000_000).optional(), // URL hoặc data-URI diagram/map (render-only)
  x: z.number().optional(),
  y: z.number().optional(),
})

// Passage: chỉ giữ field hiển thị (id/number/title/subtitle/content) — chặn alias lồng trong passage.
const PassageSchema = z.object({
  id: z.string().max(80).optional(),
  number: z.number().int().optional(),
  title: z.string().max(1000).optional(),
  subtitle: z.string().max(2000).optional(),
  content: z.string().max(200000).optional(),
})

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
  passages: z.array(PassageSchema).max(50).optional(),
  questions: z.array(QuestionSchema).max(300),
  // qid → answer key entry. Mỗi entry validate strict (reject đáp án sai cấu trúc). Optional cho writing.
  //   ADMIN-003: present (kể cả {}) = REPLACE (thay toàn bộ/xoá); absent (undefined) = giữ nguyên.
  answer_keys: z.record(AnswerKeyEntrySchema).optional(),
})
export type TestInput = z.infer<typeof TestInputSchema>

// ADMIN-002 — validate TOÀN BỘ graph trước khi publish (reading/listening attemptable, phải chấm được):
//   id không trùng; passage_id tham chiếu hợp lệ; mỗi câu có key & không có key thừa (bijection);
//   listening phải có audio. Trả message lỗi đầu tiên, null nếu hợp lệ.
export function validateExamGraph(input: {
  type: string
  passages: unknown
  questions: unknown
  keys: Record<string, unknown> | null | undefined
  audioKey: string | null
}): string | null {
  const questions = Array.isArray(input.questions) ? (input.questions as { id?: unknown; passage_id?: unknown }[]) : []
  const passages = Array.isArray(input.passages) ? (input.passages as { id?: unknown }[]) : []
  const qids = questions.map((q) => String(q?.id ?? ''))
  if (qids.some((id) => id === '')) return 'Có câu hỏi thiếu id'
  if (new Set(qids).size !== qids.length) return 'Có question id trùng lặp'

  const passageIds = new Set(passages.map((p) => String(p?.id ?? '')).filter(Boolean))
  if (passageIds.size > 0) {
    for (const q of questions) {
      const pid = q?.passage_id == null ? '' : String(q.passage_id)
      if (pid && !passageIds.has(pid)) return `Câu ${String(q.id)} tham chiếu passage không tồn tại: ${pid}`
    }
  }

  if (input.type === 'reading' || input.type === 'listening') {
    if (qids.length === 0) return 'Đề chưa có câu hỏi nào'
    const keyIds = new Set(Object.keys(input.keys ?? {}))
    for (const id of qids) if (!keyIds.has(id)) return `Câu ${id} thiếu answer key`
    const qidSet = new Set(qids)
    for (const kid of keyIds) if (!qidSet.has(kid)) return `Answer key thừa cho câu không tồn tại: ${kid}`
  }
  if (input.type === 'listening' && !input.audioKey) return 'Đề listening cần audio (audio_key) trước khi publish'
  return null
}

export type AdminTestOutcome =
  | { ok: true; test_id: string; status: string }
  | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL'; detail?: string }

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
    // Questions đã qua allowlist schema (mọi field lạ/đáp án bị strip). Không cần blacklist nữa.
    questions: input.questions,
  }
}

// ADMIN-003 — ghi test + answer_keys ATOMIC qua RPC admin_save_test (1 transaction).
//   p_replace_keys = (answer_keys có mặt): present (kể cả {}) → THAY/XOÁ; absent → giữ nguyên.
async function saveTest(admin: SupabaseClient, parsed: TestInput): Promise<AdminTestOutcome> {
  const replaceKeys = parsed.answer_keys !== undefined
  const { data, error } = await admin.rpc('admin_save_test', {
    p_id: parsed.id ?? null,
    p_row: buildRow(parsed),
    p_keys: parsed.answer_keys ?? null,
    p_replace_keys: replaceKeys,
  })
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  const res = data as { ok?: boolean; code?: string; test_id?: string; status?: string } | null
  if (res?.ok !== true) {
    if (res?.code === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND' }
    return { ok: false, code: 'INTERNAL', detail: 'admin_save_test failed' }
  }
  return { ok: true, test_id: res.test_id as string, status: res.status as string }
}

// Tạo đề mới (status=draft). Trả test_id + status — KHÔNG bao giờ trả keys.
export async function createTest(admin: SupabaseClient, raw: unknown): Promise<AdminTestOutcome> {
  const parsed = TestInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }
  return saveTest(admin, parsed.data)
}

// Sửa đề theo id (atomic). answer_keys có mặt → thay/xoá; absent → giữ nguyên. KHÔNG trả keys.
export async function updateTest(admin: SupabaseClient, raw: unknown): Promise<AdminTestOutcome> {
  const parsed = TestInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }
  if (!parsed.data.id) return { ok: false, code: 'VALIDATION_ERROR', detail: 'id bắt buộc khi PATCH' }

  const res = await saveTest(admin, parsed.data)
  if (!res.ok) return res
  // Đề published sửa type/difficulty/question_types/is_free → cột matview đổi theo.
  if (res.status === 'published') {
    const refreshed = await refreshProductSearch(admin)
    if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã cập nhật đề nhưng refresh catalog lỗi: ${refreshed.detail}` }
  }
  return res
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
  // ADMIN-002 — đọc TOÀN BỘ graph rồi validate trước khi publish (không chỉ đếm keys).
  const { data: t, error: tErr } = await admin
    .from('tests')
    .select('type, passages, questions, audio_key')
    .eq('id', testId)
    .maybeSingle()
  if (tErr) return { ok: false, code: 'INTERNAL', detail: tErr.message }
  if (!t) return { ok: false, code: 'NOT_FOUND' }
  const row = t as { type?: string; passages?: unknown; questions?: unknown; audio_key?: string | null }
  const { data: ak } = await admin.from('answer_keys').select('keys').eq('test_id', testId).maybeSingle()
  const keys = (ak as { keys?: Record<string, unknown> } | null)?.keys ?? null

  const graphError = validateExamGraph({
    type: row.type ?? '',
    passages: row.passages,
    questions: row.questions,
    keys,
    audioKey: row.audio_key ?? null,
  })
  if (graphError) return { ok: false, code: 'VALIDATION_ERROR', detail: graphError }

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
