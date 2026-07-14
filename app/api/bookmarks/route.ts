import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'

// POST /api/bookmarks — toggle test-level bookmark (M09). Idempotent.
//   bookmarks có RLS client RW-own, nhưng route dùng service_role + user_id=auth.uid() để nhất quán
//   + idempotent (unique (user_id,test_id) → toggle nhiều lần không tạo duplicate; không ảnh hưởng user khác).

const BodySchema = z.object({
  test_id: z.string().uuid(),
  bookmarked: z.boolean(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getAuthedUser(supabase)
    if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

    const raw = await request.json().catch(() => null)
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Dữ liệu bookmark không hợp lệ', { status: 400 })
    const { test_id, bookmarked } = parsed.data

    const admin = createAdminClient()
    if (bookmarked) {
      // Idempotent: đã có → giữ nguyên (on conflict do nothing).
      const { error } = await admin
        .from('bookmarks')
        .upsert({ user_id: user.id, test_id }, { onConflict: 'user_id,test_id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    } else {
      const { error } = await admin.from('bookmarks').delete().eq('user_id', user.id).eq('test_id', test_id)
      if (error) throw new Error(error.message)
    }
    return ok({ test_id, bookmarked })
  } catch {
    return fail('INTERNAL', 'Không lưu được bookmark', { status: 500 })
  }
}
