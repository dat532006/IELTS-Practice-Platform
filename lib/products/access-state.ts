import type { ExamSkill } from '@/types/exam'

// ============================================================
// W4 — Shared UI access-state helper (FE, Task 4.4).
// Nguồn trạng thái = DTO backend (per-test is_free/locked). KHÔNG suy diễn từ client/local state.
// RULE (đồng nhất exam guard, LUẬT THÉP #3): unlocked = is_free OR !locked.
// ============================================================

export type TestAccess = { is_free: boolean; locked: boolean }

// free | unlocked (đã mở: owned/test_unlock) | locked_guest (chưa login) | locked_auth (login, chưa mua)
export type TestUiState = 'free' | 'unlocked' | 'locked_guest' | 'locked_auth'

export function deriveTestUiState(test: TestAccess, isAuthed: boolean): TestUiState {
  if (test.is_free) return 'free'
  if (!test.locked) return 'unlocked'
  return isAuthed ? 'locked_auth' : 'locked_guest'
}

// CHỈ khi true mới được render link tới /exam/[id] (Task 4.3 ready signal / LUẬT THÉP #3).
export function canEnterExam(test: TestAccess): boolean {
  return test.is_free || !test.locked
}

export const SKILL_LABEL: Record<ExamSkill, string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
}

// duration giây → "X phút" (làm tròn); 0/null → "—".
export function formatDurationMin(durationSec: number): string {
  if (!durationSec || durationSec <= 0) return '—'
  return `${Math.round(durationSec / 60)} phút`
}
