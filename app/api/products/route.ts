import { createClient } from '@/lib/supabase/server'
import { getProductCatalog } from '@/lib/products/queries'
import { ok, fail } from '@/lib/api/response'
import type { CatalogParams } from '@/types/catalog'

// GET /api/products — public catalog metadata (product_search, chỉ published).
// KHÔNG trả exam payload (passages/questions/audio/answer_keys). RLS-enforced (không service_role).
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const params = Object.fromEntries(searchParams) as CatalogParams
    const { data, warnings } = await getProductCatalog(supabase, params)
    return ok(data, { warnings })
  } catch {
    return fail('INTERNAL', 'Không tải được danh sách sản phẩm', { status: 500 })
  }
}
