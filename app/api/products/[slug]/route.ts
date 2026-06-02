import { createClient } from '@/lib/supabase/server'
import { getProductDetail } from '@/lib/products/detail'
import { ok, fail } from '@/lib/api/response'

// GET /api/products/[slug] — product detail + mục lục bundle (M04).
// Optional auth: unauth ⇒ owned=false. RLS server client (KHÔNG service_role).
// KHÔNG trả exam payload (passages/questions/audio/answer_keys).
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const detail = await getProductDetail(supabase, slug, user?.id ?? null)
    if (!detail) return fail('NOT_FOUND', 'Không tìm thấy sản phẩm', { status: 404 })
    return ok(detail)
  } catch {
    return fail('INTERNAL', 'Không tải được chi tiết sản phẩm', { status: 500 })
  }
}
