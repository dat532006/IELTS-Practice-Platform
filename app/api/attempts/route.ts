import { createClient } from '@/lib/supabase/server'
import { ok, fail } from '@/lib/api/response'

// GET /api/attempts — lịch sử làm bài (M09, W17).
//   Gating theo plan ĐƯỢC ENFORCE Ở SERVER (đọc profiles.plan từ DB, KHÔNG tin client):
//     • free → chỉ 10 attempt gần nhất (SQL LIMIT).
//     • pro  → toàn bộ (cap FREE_UPPER để tránh unbounded).
//   Server client → RLS own-only (attempts.select own). Chỉ đọc.
const FREE_LIMIT = 10
const PRO_CAP = 500

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle()
  const plan = (profile as { plan?: string } | null)?.plan === 'pro' ? 'pro' : 'free'
  const limit = plan === 'pro' ? PRO_CAP : FREE_LIMIT

  // Tổng số attempt (để UI hiển thị "đang xem N / tổng M" khi bị giới hạn).
  const { count: total } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { data, error } = await supabase
    .from('attempts')
    .select('id, status, band, raw_score, duration_sec, submitted_at, started_at, tests(title, type, slug)')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) return fail('INTERNAL', 'Không tải được lịch sử', { status: 500 })

  const totalCount = total ?? 0
  return ok({
    plan,
    limited: plan === 'free' && totalCount > FREE_LIMIT,
    limit,
    total: totalCount,
    items: data ?? [],
  })
}
