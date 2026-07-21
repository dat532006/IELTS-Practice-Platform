import type { SupabaseClient } from '@supabase/supabase-js'
import type { CatalogParams, ProductCatalogData, ProductListItem, Skill } from '@/types/catalog'

const PAGE_SIZE_DEFAULT = 12
const PAGE_SIZE_MAX = 48
const PAGE_MAX = 20
const REAL_SKILLS = ['reading', 'listening', 'writing'] as const

// Hàng đọc từ matview product_search (chỉ cột public metadata — KHÔNG có passages/questions/answer_keys).
type SearchRow = {
  product_id: string
  slug: string
  title: string
  description: string | null
  thumbnail: string | null
  price_coins: number
  skills: string[] | null
  difficulties: number[] | null
  test_count: number | null
  has_free_test: boolean | null
  attempts_total: number | null
}

type CatalogFilterMethods = {
  ilike(column: string, pattern: string): unknown
  contains(column: string, values: unknown[]): unknown
  eq(column: string, value: unknown): unknown
}

function deriveSkill(skills: string[] | null): Skill {
  if (!skills || skills.length === 0) return 'mixed'
  if (skills.length === 1 && (REAL_SKILLS as readonly string[]).includes(skills[0])) {
    return skills[0] as Skill
  }
  return 'mixed'
}

function applyCatalogFilters<T>(
  query: T,
  params: CatalogParams,
): T {
  let q = query as T & CatalogFilterMethods
  if (params.q) q = q.ilike('title', `%${params.q}%`) as T & CatalogFilterMethods
  if (params.skill && params.skill !== 'mixed') q = q.contains('skills', [params.skill]) as T & CatalogFilterMethods
  if (params.qtype) q = q.contains('question_types', [params.qtype]) as T & CatalogFilterMethods
  if (params.difficulty) {
    const d = parseInt(params.difficulty, 10)
    if (!Number.isNaN(d)) q = q.contains('difficulties', [d]) as T & CatalogFilterMethods
  }
  if (params.free === '1' || params.free === 'true') q = q.eq('has_free_test', true) as T & CatalogFilterMethods
  return q as T
}

// Catalog public: đọc product_search (RLS/grant: chỉ published metadata). KHÔNG dùng service_role.
export async function getProductCatalog(
  supabase: SupabaseClient,
  params: CatalogParams,
): Promise<{ data: ProductCatalogData; warnings: string[] }> {
  const warnings: string[] = []

  let page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  if (page > PAGE_MAX) {
    warnings.push(`page bị clamp về ${PAGE_MAX}`)
    page = PAGE_MAX
  }
  let pageSize = parseInt(params.page_size ?? String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT
  if (pageSize > PAGE_SIZE_MAX) {
    warnings.push(`page_size bị clamp về ${PAGE_SIZE_MAX}`)
    pageSize = PAGE_SIZE_MAX
  }
  if (pageSize < 1) pageSize = PAGE_SIZE_DEFAULT

  // 1 round-trip: data + count trong CÙNG query (count: 'exact' không head) — trước đây 2 query
  //   tuần tự (count rồi data) làm SSR /products chậm gấp đôi (nav-lag fix 2026-07-08).
  //   Sort + range vào chain mới (KHÔNG gán lại sau .order — tránh lệch type builder).
  //   Tie-breaker cho pagination ổn định.
  const fetchPage = async (p: number) => {
    const from = (p - 1) * pageSize
    const query = applyCatalogFilters(
      supabase
        .from('product_search')
        .select(
          'product_id, slug, title, description, thumbnail, price_coins, skills, difficulties, test_count, has_free_test, attempts_total',
          { count: 'exact' },
        ),
      params,
    )
    const ordered =
      params.sort === 'hot'
        ? query.order('attempts_total', { ascending: false })
        : params.sort === 'oldest'
          ? query.order('created_at', { ascending: true }) // publish sớm nhất trước (landing rows)
          : query.order('created_at', { ascending: false })
    return ordered
      .order('sort_order', { ascending: true })
      .order('product_id', { ascending: true })
      .range(from, from + pageSize - 1)
  }

  let { data, count, error } = await fetchPage(page)
  if (error && error.code === 'PGRST103') {
    // Range vượt tổng → PostgREST 416: lấy count riêng để biết totalPages rồi clamp bên dưới.
    const head = await applyCatalogFilters(
      supabase.from('product_search').select('product_id', { count: 'exact', head: true }),
      params,
    )
    if (head.error) throw new Error(head.error.message)
    count = head.count
    data = []
    error = null
  }
  if (error) throw new Error(error.message)
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (page > totalPages) {
    // Trang vượt tổng (hiếm — chỉ khi client tự gõ page lớn): clamp + query lại đúng 1 lần.
    warnings.push(`page bị clamp về ${totalPages}`)
    page = totalPages
    const retry = await fetchPage(page)
    if (retry.error) throw new Error(retry.error.message)
    data = retry.data
  }

  const rows = (data ?? []) as unknown as SearchRow[]
  const items: ProductListItem[] = rows.map((r) => ({
    id: r.product_id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    skill: deriveSkill(r.skills),
    price_coins: r.price_coins,
    thumbnail_url: r.thumbnail,
    test_count: r.test_count ?? 0,
    attempts_total: r.attempts_total ?? 0,
    is_free: r.price_coins === 0, // badge "Miễn phí" = product giá 0 (KHÁC has_free_test dùng cho filter)
  }))

  return {
    data: {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
    },
    warnings,
  }
}
