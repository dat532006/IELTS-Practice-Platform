import type { WritingErrorHighlight } from '@/types/exam'

// ============================================================
// W11 — Anchoring highlight lỗi Writing (M07). Tách khỏi component để test IMPORT & CHẠY code production
//   (TEST-006: smoke trước đây COPY logic này + assert tautology → production đổi/hỏng vẫn xanh giả).
//   PURE: chỉ import TYPE (bị Node type-strip xoá) → smoke .mjs import trực tiếp được. KHÔNG đụng DOM/React.
// ============================================================

export type Segment = { text: string; hl?: WritingErrorHighlight }

// Match KHÔNG chồng lấn của từng quote trong essay (exact, fallback case-insensitive). Giữ index trong
//   essay gốc (giữ case gốc). Chồng lấn → giữ match trước. Reconstruct lossless.
export function buildSegments(essay: string, highlights: WritingErrorHighlight[]): Segment[] {
  const ranges: { start: number; end: number; hl: WritingErrorHighlight }[] = []
  for (const hl of highlights) {
    const q = hl.quote
    if (!q) continue
    let idx = essay.indexOf(q)
    if (idx < 0) idx = essay.toLowerCase().indexOf(q.toLowerCase()) // forgiving: giữ index trong essay gốc
    if (idx < 0) continue
    ranges.push({ start: idx, end: idx + q.length, hl })
  }
  ranges.sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start < cursor) continue // chồng lấn → bỏ qua (giữ match trước)
    if (r.start > cursor) segments.push({ text: essay.slice(cursor, r.start) })
    segments.push({ text: essay.slice(r.start, r.end), hl: r.hl })
    cursor = r.end
  }
  if (cursor < essay.length) segments.push({ text: essay.slice(cursor) })
  return segments
}
