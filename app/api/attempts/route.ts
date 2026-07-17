import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/auth/guards'
import { ok, fail } from '@/lib/api/response'
import { attachAttemptResultHrefs } from '@/lib/dashboard/attempt-result'
import { loadWritingResultIds } from '@/lib/dashboard/writing-results'

// GET /api/attempts — lịch sử làm bài (M09, W17).
// Gating plan vẫn enforce server-side; result_href chỉ được gắn khi result tương ứng sẵn sàng.
const FREE_LIMIT = 10
const PRO_CAP = 500

export async function GET() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)
  if (!user) return fail('UNAUTHORIZED', 'Bạn cần đăng nhập', { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle()
  const plan = (profile as { plan?: string } | null)?.plan === 'pro' ? 'pro' : 'free'
  const limit = plan === 'pro' ? PRO_CAP : FREE_LIMIT

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

  let writingResultIds: Set<string>
  try {
    writingResultIds = await loadWritingResultIds(supabase, user.id, data ?? [])
  } catch {
    return fail('INTERNAL', 'Không tải được trạng thái kết quả', { status: 500 })
  }

  const totalCount = total ?? 0
  return ok({
    plan,
    limited: plan === 'free' && totalCount > FREE_LIMIT,
    limit,
    total: totalCount,
    items: attachAttemptResultHrefs(data ?? [], writingResultIds),
  })
}
