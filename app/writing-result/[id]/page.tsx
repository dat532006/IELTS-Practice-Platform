import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WritingResultClient } from '@/components/writing/WritingResultClient'

// W10 (F-B) — /writing-result/[id] (M07, api_contract §4). Xem lại kết quả Writing đã chấm.
// Server gate: guest → login. Owner-guard + đọc writing_submissions ở API.
export default async function WritingResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/writing-result/${id}`)
  return <WritingResultClient attemptId={id} />
}
