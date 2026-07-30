// ============================================================
// Passive logout (SEC — Owner duyệt 2026-07-13): treo máy quá hạn → tự đăng xuất về /login?reason=idle.
// PURE core tách khỏi component để gate chạy được không cần browser (cùng khuôn với lib/auth/logout.ts:
//   runCheckedSignOut ↔ logout_checked_gate). Component chỉ còn phần gắn listener + điều hướng.
// Đổi ngưỡng thì SỬA Ở ĐÂY — đây là nguồn duy nhất, gate đọc chính hằng số này nên không trôi được.
// ============================================================

/** Ngưỡng mặc định toàn site. */
export const IDLE_LIMIT_MS = 30 * 60_000 // 30 phút
/** Khu quản trị chặt hơn vì rủi ro cao hơn. */
export const ADMIN_IDLE_LIMIT_MS = 15 * 60_000 // 15 phút
/** Nhịp kiểm tra. Đếm bằng TIMESTAMP chứ không setTimeout thuần: máy sleep / tab bị throttle, tỉnh dậy
 *  check thấy đã quá hạn là văng ngay — đúng kịch bản "treo máy". */
export const IDLE_CHECK_EVERY_MS = 30_000
/** Trang đang thi: thí sinh nghe audio / đọc passage có thể không chạm chuột rất lâu, và timer của đề
 *  đã giới hạn thời gian rồi → thời gian ở đây luôn tính là ACTIVE. */
export const IDLE_EXCLUDED_PREFIXES = ['/exam/', '/writing/'] as const

/** Ngưỡng cho một route. `null` = route được loại trừ, không bao giờ tự đăng xuất. */
export function idleLimitForPath(path: string | null | undefined): number | null {
  const p = path ?? ''
  if (IDLE_EXCLUDED_PREFIXES.some((x) => p.startsWith(x))) return null
  return p.startsWith('/admin') ? ADMIN_IDLE_LIMIT_MS : IDLE_LIMIT_MS
}

/** Quyết định đăng xuất hay chưa. Guest không bao giờ bị ảnh hưởng. */
export function shouldIdleLogout(input: {
  signedIn: boolean
  path: string | null | undefined
  now: number
  lastActive: number
}): boolean {
  if (!input.signedIn) return false
  const limit = idleLimitForPath(input.path)
  if (limit === null) return false
  return input.now - input.lastActive >= limit
}

/** Event auth nào được TÍNH LÀ hoạt động của người dùng.
 *  `TOKEN_REFRESHED` thì KHÔNG: nó do supabase-js tự chạy nền (ticker 30s, làm mới khi token sắp hết
 *  hạn) — nếu tính là hoạt động thì cứ mỗi lần gia hạn là đồng hồ idle lại về 0, và khi thời hạn JWT
 *  trên dashboard ngắn hơn ngưỡng idle thì KHÔNG BAO GIỜ đăng xuất được. Đó là lỗi câm: không log,
 *  không crash, chỉ là tính năng lặng lẽ ngừng chạy. */
export function isActivityAuthEvent(event: string): boolean {
  return event === 'SIGNED_IN' || event === 'INITIAL_SESSION'
}
