// ============================================================
// W6 — Answer normalize (M06 scoring). PURE, deterministic.
// Dùng cho cả gap filling, MCQ, TF/NG, YN/NG.
//   - trim + collapse whitespace (mọi run khoảng trắng → 1 space)
//   - match='ci' → lowercase (case-insensitive); match='exact' → giữ nguyên hoa/thường
// KHÔNG strip dấu câu/article ở W6 (giữ deterministic; mở rộng sau nếu cần).
// ============================================================

export type MatchMode = 'ci' | 'exact'

export function normalizeAnswer(input: unknown, match: MatchMode = 'ci'): string {
  if (input == null) return ''
  let s = String(input)
  s = s.trim().replace(/\s+/g, ' ')
  if (match === 'ci') s = s.toLowerCase()
  return s
}
