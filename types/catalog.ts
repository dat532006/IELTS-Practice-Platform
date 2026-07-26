// W3 Product API DTO — theo TaskBrief Backend W3 (ProductListItem).
export type Skill = 'reading' | 'listening' | 'writing' | 'mixed'

export type ProductListItem = {
  id: string
  slug: string
  title: string
  description: string | null
  skill: Skill
  price_coins: number
  thumbnail_url: string | null
  test_count: number
  attempts_total: number
  is_free: boolean
}

export type Pagination = {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export type ProductCatalogData = {
  items: ProductListItem[]
  pagination: Pagination
}

// W4 Product Detail DTO — docs/TaskBrief/BackendEngineer/phase1/w4.md Task 4.2.
// Mục lục test = metadata-only (KHÔNG có passages/questions/answer_keys).
export type ProductDetailTest = {
  id: string
  title: string
  skill: 'reading' | 'listening' | 'writing'
  duration_sec: number
  is_free: boolean
  locked: boolean
  position: number
}

export type ProductDetail = {
  id: string
  slug: string
  title: string
  description: string | null
  price_coins: number
  thumbnail_url: string | null
  // Khung hiển thị ảnh (migration 20260726000200) — 50/50/100 = canh giữa, vừa khung.
  thumb_pos_x: number
  thumb_pos_y: number
  thumb_zoom: number
  owned: boolean
  attempts_total: number // social proof = tổng attempts_count các đề trong bundle (published)
  tests: ProductDetailTest[]
}

// Query params thô (từ URL) cho catalog.
export type CatalogParams = {
  q?: string
  skill?: string
  qtype?: string
  difficulty?: string
  free?: string
  sort?: string
  page?: string
  page_size?: string
}
