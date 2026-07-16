// ============================================================
// AUTH-009 — Phán quyết ban-check, tách thuần để test được (sự cố prod 2026-07-17).
// SEC-001 THIẾT KẾ fail-open khi RPC lỗi (comment trong guards.ts ghi rõ: "tránh global outage;
//   direct PostgREST write vẫn bị RLS chặn cứng ở DB. Deploy DB TRƯỚC server để đóng cửa sổ này")
//   — nhưng CODE lại viết `if (error) return null` = fail-CLOSED. Prod thiếu migration 20260714000100
//   (is_user_banned) → RPC PGRST202 → MỌI guard coi người dùng đã đăng nhập là CHƯA đăng nhập →
//   /admin đẩy về /login?next=/admin, login page (getUser thô) thấy user đẩy ngược lại /admin →
//   ERR_TOO_MANY_REDIRECTS, và mọi API xác thực trả 401. Đúng "global outage" comment tiên đoán.
// Phán quyết: CHỈ deny khi RPC trả về banned === true tường minh. RPC lỗi (thiếu hàm/DB hiccup/schema
//   cache) → allow (fail-open theo thiết kế): user bị ban chỉ còn access token dư ~1h, còn ghi/đọc
//   nhạy cảm vẫn bị RLS ban-policy chặn ở DB — đổi lấy việc KHÔNG sập auth toàn site vì 1 hàm thiếu.
// PURE: không import, không 'server-only' → Node type-strip test trực tiếp.
// ============================================================

export type BanVerdict = 'allow' | 'deny'

export function banVerdict(banned: unknown, rpcError: unknown): BanVerdict {
  if (banned === true) return 'deny' // ban xác nhận tường minh — chặn
  // rpcError (hàm chưa migrate / DB hiccup) hoặc banned false/null/kiểu lạ → allow.
  //   KHÔNG BAO GIỜ deny vì lỗi hạ tầng — deny hàng loạt = sập auth toàn site (đã xảy ra 2026-07-17).
  void rpcError
  return 'allow'
}
