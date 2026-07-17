import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { attemptSkill, type AttemptResultCandidate } from '@/lib/dashboard/attempt-result'

const QUERY_CHUNK = 75

// Dùng session client, không dùng service role: RLS writing_submissions SELECT own vẫn là boundary chính.
// Chia nhỏ ID để lịch sử Pro (tối đa 500) không tạo URL PostgREST quá dài.
export async function loadWritingResultIds(
  supabase: SupabaseClient,
  userId: string,
  attempts: AttemptResultCandidate[],
): Promise<Set<string>> {
  const writingIds = attempts.filter((attempt) => attemptSkill(attempt) === 'writing').map((attempt) => attempt.id)

  if (writingIds.length === 0) return new Set()

  const chunks: string[][] = []
  for (let index = 0; index < writingIds.length; index += QUERY_CHUNK) {
    chunks.push(writingIds.slice(index, index + QUERY_CHUNK))
  }

  const rows = await Promise.all(
    chunks.map(async (ids) => {
      const { data, error } = await supabase
        .from('writing_submissions')
        .select('attempt_id')
        .eq('user_id', userId)
        .in('attempt_id', ids)
        .not('ai_score', 'is', null)
      if (error) throw new Error(error.message)
      return (data ?? []) as Array<{ attempt_id: string }>
    }),
  )

  return new Set(rows.flat().map((row) => row.attempt_id))
}
