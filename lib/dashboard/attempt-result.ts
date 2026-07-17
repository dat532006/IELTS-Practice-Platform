type AttemptTestRef = { type?: string | null }

export type AttemptResultCandidate = {
  id: string
  status: string
  tests?: AttemptTestRef | AttemptTestRef[] | null
}

const isTerminal = (status: string): boolean => status === 'submitted' || status === 'expired'

export function attemptSkill(attempt: AttemptResultCandidate): string | null {
  const test = Array.isArray(attempt.tests) ? attempt.tests[0] : attempt.tests
  return test?.type ?? null
}

export function attemptResultHref(
  attempt: AttemptResultCandidate,
  writingResultIds: ReadonlySet<string>,
): string | null {
  const skill = attemptSkill(attempt)
  if (skill === 'writing') {
    return writingResultIds.has(attempt.id) ? `/writing-result/${attempt.id}` : null
  }
  if ((skill === 'reading' || skill === 'listening') && isTerminal(attempt.status)) {
    return `/result/${attempt.id}`
  }
  return null
}

export function attachAttemptResultHrefs<T extends AttemptResultCandidate>(
  attempts: T[],
  writingResultIds: ReadonlySet<string>,
): Array<T & { result_href: string | null }> {
  return attempts.map((attempt) => ({
    ...attempt,
    result_href: attemptResultHref(attempt, writingResultIds),
  }))
}
