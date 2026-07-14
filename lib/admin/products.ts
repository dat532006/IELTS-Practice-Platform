import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshProductSearch } from '@/lib/admin/product-search'

// ============================================================
// W13 — Admin Product / Bundle Manager & Pricing (M11/M04). SERVER-ONLY.
// LUẬT THÉP #4: `products.price_coins` = source of truth giá → KHÔNG tin giá client,
//   client KHÔNG quyết giá / KHÔNG tự unlock. Mọi mutation chạy bằng service_role (admin client)
//   SAU requireAdmin (route lo guard). Published-only RLS (products/collection_tests) đã có sẵn.
//   KHÔNG trả answer_keys/passages/questions xuống client (detail = test metadata-only).
// ============================================================

// slug catalog-facing: lowercase kebab (đồng bộ URL /products/[slug]).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const ProductInputSchema = z.object({
  id: z.string().uuid().optional(), // PATCH theo id
  slug: z.string().min(1).max(200).regex(SLUG_RE, 'slug chỉ gồm a-z, 0-9 và dấu gạch ngang'),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  thumbnail: z.string().max(1000).optional(),
  kind: z.enum(['single', 'bundle']),
  price_coins: z.number().int('price_coins phải là số nguyên').min(0, 'price_coins không được âm').max(100_000_000),
  sort_order: z.number().int().min(0).max(100_000).optional(),
})
export type ProductInput = z.infer<typeof ProductInputSchema>

export const BindTestSchema = z.object({
  test_id: z.string().uuid(),
  position: z.number().int().min(0).max(100_000).default(0),
})

export type AdminProductOutcome =
  | { ok: true; product_id: string; status: string }
  | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL'; detail?: string }

// Postgres unique_violation (vd slug trùng) → 400 VALIDATION_ERROR thay vì 500.
const UNIQUE_VIOLATION = '23505'

function buildRow(input: ProductInput) {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    thumbnail: input.thumbnail ?? null,
    kind: input.kind,
    price_coins: input.price_coins, // server-authoritative
    sort_order: input.sort_order ?? 0,
  }
}

// Tạo product mới (status=draft). Trả product_id + status.
export async function createProduct(admin: SupabaseClient, raw: unknown): Promise<AdminProductOutcome> {
  const parsed = ProductInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }

  const { data, error } = await admin
    .from('products')
    .insert({ ...buildRow(parsed.data), status: 'draft' })
    .select('id, status')
    .single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, code: 'VALIDATION_ERROR', detail: 'slug đã tồn tại' }
    return { ok: false, code: 'INTERNAL', detail: error.message }
  }
  return { ok: true, product_id: data.id as string, status: data.status as string }
}

// Sửa product theo id (full body, update-by-id). KHÔNG đổi status ở đây (publish riêng).
export async function updateProduct(admin: SupabaseClient, raw: unknown): Promise<AdminProductOutcome> {
  const parsed = ProductInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }
  if (!parsed.data.id) return { ok: false, code: 'VALIDATION_ERROR', detail: 'id bắt buộc khi PATCH' }

  const { data, error } = await admin
    .from('products')
    .update(buildRow(parsed.data))
    .eq('id', parsed.data.id)
    .select('id, status')
    .maybeSingle()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, code: 'VALIDATION_ERROR', detail: 'slug đã tồn tại' }
    return { ok: false, code: 'INTERNAL', detail: error.message }
  }
  if (!data) return { ok: false, code: 'NOT_FOUND' }
  // Draft/hidden không nằm trong matview; product published phải refresh để catalog thấy ngay.
  if ((data.status as string) === 'published') {
    const refreshed = await refreshProductSearch(admin)
    if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã cập nhật product nhưng refresh catalog lỗi: ${refreshed.detail}` }
  }
  return { ok: true, product_id: data.id as string, status: data.status as string }
}

export type AdminProductListItem = {
  id: string
  slug: string | null
  title: string | null
  kind: string | null
  price_coins: number
  status: string
  sort_order: number
  test_count: number
}

// List admin — BAO cả draft/hidden (khác catalog public chỉ published). Metadata-only, no leak.
export async function listProducts(
  admin: SupabaseClient,
): Promise<{ ok: true; items: AdminProductListItem[] } | { ok: false; code: 'INTERNAL'; detail?: string }> {
  const { data, error } = await admin
    .from('products')
    .select('id, slug, title, kind, price_coins, status, sort_order, collection_tests(count)')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  const items: AdminProductListItem[] = (data ?? []).map((p) => {
    const row = p as Record<string, unknown>
    const ct = row.collection_tests as Array<{ count: number }> | undefined
    return {
      id: row.id as string,
      slug: (row.slug as string) ?? null,
      title: (row.title as string) ?? null,
      kind: (row.kind as string) ?? null,
      price_coins: (row.price_coins as number) ?? 0,
      status: row.status as string,
      sort_order: (row.sort_order as number) ?? 0,
      test_count: ct?.[0]?.count ?? 0,
    }
  })
  return { ok: true, items }
}

// Detail admin — product + mục lục test METADATA-ONLY (KHÔNG passages/questions/answer_keys/audio_key).
export async function getProductDetail(admin: SupabaseClient, productId: string) {
  const { data: product } = await admin
    .from('products')
    .select('id, slug, title, description, thumbnail, kind, price_coins, status, sort_order, created_at')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return { ok: false as const, code: 'NOT_FOUND' as const }

  const { data: links } = await admin
    .from('collection_tests')
    .select('position, test_id, tests(id, slug, title, type, status)')
    .eq('product_id', productId)
    .order('position', { ascending: true })

  const tests = (links ?? []).map((l) => {
    const row = l as Record<string, unknown>
    const t = (row.tests ?? {}) as Record<string, unknown>
    return {
      position: (row.position as number) ?? 0,
      test_id: row.test_id as string,
      slug: (t.slug as string) ?? null,
      title: (t.title as string) ?? null,
      type: (t.type as string) ?? null,
      status: (t.status as string) ?? null,
    }
  })
  return { ok: true as const, product, tests }
}

// Gắn đề vào product (mục lục). Upsert onConflict (product_id,test_id) → idempotent/race-safe.
// Chỉ gắn product + test TỒN TẠI (FK cũng chặn, nhưng trả lỗi rõ trước).
export async function addTestToProduct(
  admin: SupabaseClient,
  productId: string,
  raw: unknown,
): Promise<
  { ok: true; product_id: string; test_id: string; position: number } | { ok: false; code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL'; detail?: string }
> {
  const parsed = BindTestSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message }

  const { data: product } = await admin.from('products').select('id, status').eq('id', productId).maybeSingle()
  if (!product) return { ok: false, code: 'NOT_FOUND', detail: 'product không tồn tại' }
  const { data: test } = await admin.from('tests').select('id, status').eq('id', parsed.data.test_id).maybeSingle()
  if (!test) return { ok: false, code: 'VALIDATION_ERROR', detail: 'test_id không tồn tại' }

  const { error } = await admin
    .from('collection_tests')
    .upsert(
      { product_id: productId, test_id: parsed.data.test_id, position: parsed.data.position },
      { onConflict: 'product_id,test_id' },
    )
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  // ADMIN-009 — LUÔN refresh sau khi gắn (durable), KHÔNG quyết theo status ĐỌC TRƯỚC upsert: một publish
  //   chen giữa read↔decision có thể khiến cặp vừa-published bị BỎ refresh → catalog cũ (missed invalidation).
  //   Bind là thao tác admin hiếm; refresh dư khi product/test còn draft (không đổi matview) chấp nhận được.
  //   Đồng nhất với đường unbind (DELETE) vốn đã luôn refresh.
  const refreshed = await refreshProductSearch(admin)
  if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `đã gắn đề nhưng refresh catalog lỗi: ${refreshed.detail}` }
  return { ok: true, product_id: productId, test_id: parsed.data.test_id, position: parsed.data.position }
}

// ADMIN-010 — Hoán đổi thứ tự 2 đề trong product ATOMIC (RPC 1 transaction, khoá FOR UPDATE) → không để
//   swap nửa vời/trùng position như đường UI-2-request cũ. position là thứ tự nội bộ (KHÔNG nằm trong
//   matview product_search) → không cần refresh catalog.
export async function reorderProductTests(
  admin: SupabaseClient,
  productId: string,
  testA: string,
  testB: string,
): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'INTERNAL'; detail?: string }> {
  const { data, error } = await admin.rpc('reorder_product_tests', {
    p_product_id: productId,
    p_test_a: testA,
    p_test_b: testB,
  })
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  const res = data as { ok?: boolean; code?: string } | null
  if (!res?.ok) return res?.code === 'NOT_FOUND' ? { ok: false, code: 'NOT_FOUND' } : { ok: false, code: 'INTERNAL' }
  return { ok: true }
}

// Publish draft→published + refresh product_search (service_role). Trả status mới.
export async function publishProduct(admin: SupabaseClient, productId: string): Promise<AdminProductOutcome> {
  const { data, error } = await admin
    .from('products')
    .update({ status: 'published' })
    .eq('id', productId)
    .select('id, status')
    .maybeSingle()
  if (error) return { ok: false, code: 'INTERNAL', detail: error.message }
  if (!data) return { ok: false, code: 'NOT_FOUND' }

  // Matview product_search BỎ QUA RLS → refresh chỉ qua RPC service_role (đã grant execute service_role).
  const refreshed = await refreshProductSearch(admin)
  if (!refreshed.ok) return { ok: false, code: 'INTERNAL', detail: `published nhưng refresh product_search lỗi: ${refreshed.detail}` }

  return { ok: true, product_id: data.id as string, status: data.status as string }
}
