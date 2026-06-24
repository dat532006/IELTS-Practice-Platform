// ============================================================
// W10 — Writing overall band (M07). PURE, unit-testable.
// LUẬT THÉP W10: overall = task1*(1/3) + task2*(2/3), round nearest 0.5.
//   Server là source of truth — KHÔNG tin overall do AI trả.
// Band hợp lệ: [0..9], bước 0.5 (b*2 là integer).
// ============================================================

export const roundHalf = (x: number): number => Math.round(x * 2) / 2

export const isValidBand = (b: unknown): b is number =>
  typeof b === 'number' && Number.isFinite(b) && b >= 0 && b <= 9 && Number.isInteger(b * 2)

// task1 chiếm 1/3, task2 chiếm 2/3 (trọng số IELTS). Caller PHẢI validate band trước.
export const computeOverallBand = (task1Band: number, task2Band: number): number =>
  roundHalf(task1Band * (1 / 3) + task2Band * (2 / 3))
