import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { examFontVars } from '@/app/exam-fonts'
import { testEntryPath } from '@/lib/exam/entry-route'
import type { ExamSkill } from '@/types/exam'
import '../../exam.css'

// W5 — /exam/[id] (M05). Root layout (KHÔNG marketing chrome) — trải nghiệm thi tập trung.
// Server gate: guest → login (attempt cần owner). Access (free|test_unlocks) + payload do ExamRunner
// boot qua POST /api/exam/[id]/start → GET /api/exam/[id] (payload source duy nhất, W4 gate).
export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: test } = await supabase.from('tests').select('type').eq('id', id).maybeSingle()
  const canonicalPath = test?.type ? testEntryPath(test.type as ExamSkill, id) : `/exam/${id}`
  if (canonicalPath !== `/exam/${id}`) redirect(canonicalPath)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/exam/${id}`)
  return (
    <div className={examFontVars}>
      <ExamRunner testId={id} />
    </div>
  )
}
