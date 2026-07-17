import type { ExamSkill } from '@/types/exam'

export function testEntryPath(skill: ExamSkill, testId: string): string {
  return skill === 'writing' ? `/writing/${testId}` : `/exam/${testId}`
}
