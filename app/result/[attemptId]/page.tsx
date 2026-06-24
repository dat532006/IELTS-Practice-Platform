import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ResultView } from '@/components/result/ResultView'

// W8 — /result/[attemptId] (M05). Guard owner+terminal do BACKEND (`GET /api/result/[attemptId]`).
// Server gate: guest → login (result thuộc owner). ResultView fetch API đã guard; KHÔNG đọc answer_keys.
export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/result/${attemptId}`)
  return <ResultView attemptId={attemptId} />
}
