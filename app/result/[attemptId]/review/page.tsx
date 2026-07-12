import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ExamReviewLoader } from '@/components/result/ExamReviewLoader'
import { examFontVars } from '@/app/exam-fonts'
import '../../../exam.css'

// 2026-07-12 — /result/[attemptId]/review: xem lại bài đã nộp TRONG giao diện thi thật.
// Guard thật ở backend (result: owner+terminal; payload: access check) — trang chỉ gate guest → login.
export default async function ExamReviewPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/result/${attemptId}/review`)
  return (
    <div className={examFontVars}>
      <ExamReviewLoader attemptId={attemptId} />
    </div>
  )
}
