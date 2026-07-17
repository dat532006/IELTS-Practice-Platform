import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'
import { attachAttemptResultHrefs } from '@/lib/dashboard/attempt-result'
import { loadWritingResultIds } from '@/lib/dashboard/writing-results'

// GET /api/dashboard — tổng quan tài khoản người dùng (M09, W17).
// Session client + RLS own-only; recent_attempts chỉ nhận result_href khi kết quả thực sự sẵn sàng.
export async function GET() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const [profileRes, attemptsTotal, attemptsSubmitted, ownedProducts, vocabCount, bookmarksCount, bandsRes, recentRes] =
    await Promise.all([
      supabase.from('profiles').select('coins, plan, name, email').eq('id', user.id).maybeSingle(),
      supabase.from('attempts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('attempts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'submitted'),
      supabase.from('product_unlocks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('vocab_log').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('attempts').select('band').eq('user_id', user.id).eq('status', 'submitted').not('band', 'is', null),
      supabase
        .from('attempts')
        .select('id, status, band, raw_score, submitted_at, started_at, tests(title, type, slug)')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(5),
    ])

  if (recentRes.error) return fail('INTERNAL', 'Không tải được hoạt động gần đây', { status: 500 })

  let writingResultIds: Set<string>
  try {
    writingResultIds = await loadWritingResultIds(supabase, user.id, recentRes.data ?? [])
  } catch {
    return fail('INTERNAL', 'Không tải được trạng thái kết quả', { status: 500 })
  }

  const profile = (profileRes.data ?? {}) as { coins?: number; plan?: string; name?: string | null; email?: string | null }
  const bands = (bandsRes.data ?? []).map((row) => Number((row as { band: number }).band)).filter((band) => !Number.isNaN(band))
  const avgBand = bands.length ? Math.round((bands.reduce((sum, band) => sum + band, 0) / bands.length) * 10) / 10 : null

  return ok({
    profile: { name: profile.name ?? null, email: profile.email ?? null, plan: profile.plan ?? 'free', coins: profile.coins ?? 0 },
    stats: {
      attempts_total: attemptsTotal.count ?? 0,
      attempts_submitted: attemptsSubmitted.count ?? 0,
      avg_band: avgBand,
      owned_products: ownedProducts.count ?? 0,
      vocab_count: vocabCount.count ?? 0,
      bookmarks_count: bookmarksCount.count ?? 0,
    },
    recent_attempts: attachAttemptResultHrefs(recentRes.data ?? [], writingResultIds),
  })
}
