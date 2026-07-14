import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'

// GET /api/dashboard — tổng quan tài khoản người dùng (M09, W17).
//   Dùng server client (session user) → RLS tự lọc OWN-ONLY (attempts/product_unlocks/vocab_log/bookmarks/profiles
//   đều có policy select own). KHÔNG service_role → không thể lộ dữ liệu người khác kể cả khi query sai.
//   Chỉ đọc, không mutate. Số liệu tổng hợp phía server.
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

  const profile = (profileRes.data ?? {}) as { coins?: number; plan?: string; name?: string | null; email?: string | null }
  const bands = (bandsRes.data ?? []).map((r) => Number((r as { band: number }).band)).filter((n) => !Number.isNaN(n))
  const avgBand = bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10 : null

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
    recent_attempts: recentRes.data ?? [],
  })
}
