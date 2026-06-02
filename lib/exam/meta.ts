import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasTestUnlock } from '@/lib/exam/access'
import { isUuid } from '@/lib/utils'
import type { ExamSkill, TestMeta } from '@/types/exam'

// ============================================================
// W4 — Pre-exam SAFE metadata (M04/M05). Dùng chung cho `/api/tests/[id]` và page `/tests/[id]`.
// RLS server client: chỉ test published + cột metadata (passages/questions KHÔNG grant → không lộ payload).
// `locked` theo RULE truy cập duy nhất: is_free OR test_unlocks (LUẬT THÉP #3).
// ============================================================

type TestMetaRow = {
  id: string
  title: string
  type: ExamSkill
  is_free: boolean
  duration_sec: number | null
  difficulty: number | null
  source: string | null
  question_types: string[] | null
}

export async function getTestMeta(
  supabase: SupabaseClient,
  id: string,
  userId: string | null,
): Promise<TestMeta | null> {
  if (!isUuid(id)) return null // id sai định dạng → "không tìm thấy" (tránh Postgres 22P02 → 500)
  const { data, error } = await supabase
    .from('tests')
    .select('id, title, type, is_free, duration_sec, difficulty, source, question_types')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const t = data as unknown as TestMetaRow | null
  if (!t) return null

  const unlocked = t.is_free || (await hasTestUnlock(supabase, t.id, userId))
  return {
    id: t.id,
    title: t.title,
    skill: t.type,
    duration_sec: t.duration_sec ?? 0,
    is_free: t.is_free,
    difficulty: t.difficulty,
    source: t.source,
    question_types: t.question_types ?? [],
    locked: !unlocked,
  }
}
