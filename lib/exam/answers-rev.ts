// ============================================================
// EXAM-004 — Optimistic concurrency cho draft answers (chống mất đáp án âm thầm khi làm bài đa tab/thiết bị).
// Bug gốc: tab CŨ (mở khi answers còn ít) autosave/submit body cũ → GHI ĐÈ toàn bộ answers mà tab MỚI vừa
//   lưu → mất đáp án + chấm thấp. Không có revision/lease.
// Cơ chế: cột additive `attempts.answers_rev` tăng mỗi lần answers được ghi thắng. Client giữ rev đã thấy
//   (từ /start + mỗi autosave), gửi kèm `expected_rev`. Server so:
//     • expected_rev === current  → cho ghi, rev := current+1
//     • expected_rev !== current  → 'stale' (tab cũ) → 409 ANSWERS_STALE, KHÔNG ghi đè
//     • expected_rev === undefined (client cũ) → vẫn cho ghi (không regression), vẫn bump rev
//   Guard rev THẬT nằm ở conditional UPDATE `.eq('answers_rev', current)` (atomic dưới row-lock) — hàm này
//   là pre-check thuần, testable; TOCTOU (autosave chen giữa read↔write) do guard .eq bắt (0 row → stale).
// Thuần (không import runtime) → Node smoke import trực tiếp.
// ============================================================

export type RevCheck =
  | { ok: true; nextRev: number }
  | { ok: false; reason: 'stale' }

export function checkAnswersRev(currentRev: number, expectedRev: number | undefined): RevCheck {
  if (expectedRev !== undefined && expectedRev !== currentRev) return { ok: false, reason: 'stale' }
  return { ok: true, nextRev: currentRev + 1 }
}
