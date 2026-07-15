// ============================================================
// EXAM-003 / EXAM-009 — Snapshot-at-start cho review.
// Bug: review đọc nội dung tests HIỆN TẠI (mutable) qua /api/exam published-only → (003) đề đã ẩn thì
//   xem lại GÃY; (009) đề bị sửa sau khi thi → đúng/sai/evidence khi xem lại TRÔI khỏi thứ người học thấy.
// Owner chốt (2026-07-15): chụp passages+questions lúc START (attempt_content_snapshots). Review đọc TỪ
//   bản chụp (độc lập published visibility, cố định nội dung). Attempt cũ (không bản chụp) → fallback nội
//   dung hiện tại + cờ stale để UI báo "bản gốc có thể đã đổi".
// Hàm thuần chọn nguồn — testable; wiring (đọc snapshot, sanitize, build review) ở getResult.
// ============================================================

export type SnapshotContent = { passages: unknown; questions: unknown } | null
export type ReviewContent = { passages: unknown; questions: unknown; stale: boolean }

// snapshot có bản ghi (dù passages/questions null) → ưu tiên tuyệt đối (đó là thứ người học đã thấy).
// Không có bản ghi → fallback nội dung hiện tại + stale=true.
export function pickReviewContent(
  snapshot: SnapshotContent,
  current: { passages: unknown; questions: unknown },
): ReviewContent {
  if (snapshot) return { passages: snapshot.passages, questions: snapshot.questions, stale: false }
  return { passages: current.passages, questions: current.questions, stale: true }
}
