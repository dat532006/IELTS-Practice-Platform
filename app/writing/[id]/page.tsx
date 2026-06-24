import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WritingRunner } from '@/components/writing/WritingRunner'

// W10 — /writing/[id] (M07). Writing test (type='writing'): 2 cột đề | vùng viết Task 1+2 + AI result.
// Server gate: guest → login (attempt cần owner). Access (free|test_unlocks) + payload (passages=prompt)
//   boot trong WritingRunner qua POST /api/exam/[id]/start → GET /api/exam/[id]. Chấm qua POST /api/grade-writing.
export default async function WritingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/writing/${id}`)
  return <WritingRunner testId={id} />
}
