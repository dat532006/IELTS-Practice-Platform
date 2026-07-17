import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WritingRunner } from '@/components/writing/WritingRunner'
import { examFontVars } from '@/app/exam-fonts'
import { testEntryPath } from '@/lib/exam/entry-route'
import type { ExamSkill } from '@/types/exam'
import '../../exam.css'

// W10 — /writing/[id] (M07). Writing test (type='writing'): 2 cột đề | vùng viết Task 1+2 + AI result.
// Server gate: guest → login (attempt cần owner). Access (free|test_unlocks) + payload (passages=prompt)
//   boot trong WritingRunner qua POST /api/exam/[id]/start → GET /api/exam/[id]. Chấm qua POST /api/grade-writing.
export default async function WritingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: test } = await supabase.from('tests').select('type').eq('id', id).maybeSingle()
  const canonicalPath = test?.type ? testEntryPath(test.type as ExamSkill, id) : `/writing/${id}`
  if (canonicalPath !== `/writing/${id}`) redirect(canonicalPath)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/writing/${id}`)
  return (
    <div className={examFontVars}>
      <WritingRunner testId={id} />
    </div>
  )
}
