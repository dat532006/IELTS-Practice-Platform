import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProductSearchRefreshOutcome =
  | { ok: true }
  | { ok: false; detail: string }

// Refresh matview product_search sau mutation admin làm đổi dữ liệu catalog
// (bind/unbind đề, publish/hide/sửa test, sửa product). Mutation bảng thật đã commit
// trước RPC này, nên caller PHẢI trả lỗi để admin có thể retry thao tác idempotent;
// không được báo 2xx khi catalog vẫn stale. (Bug 2026-07-13: VOL 09 publish trước,
// gắn đề sau → skills=[] → không hiện dưới filter Reading.)
export async function refreshProductSearch(admin: SupabaseClient): Promise<ProductSearchRefreshOutcome> {
  const { error } = await admin.rpc('refresh_product_search')
  if (error) {
    console.error('[product_search] refresh thất bại; mutation đã ghi nhưng catalog còn stale:', error.message)
    return { ok: false, detail: error.message }
  }
  return { ok: true }
}
