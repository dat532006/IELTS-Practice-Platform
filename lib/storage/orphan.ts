// ============================================================
// STORE-001 — Orphan storage object cleanup (Owner chốt: compensated-delete + orphan job có grace).
// Bug: thay/gỡ cover (tests.cover_image) hoặc avatar (profiles.avatar) KHÔNG xoá object cũ → orphan (chi
//   phí lưu trữ + tồn dư dữ liệu/privacy). Fix chính = compensated-delete (xoá object cũ ngay khi thay,
//   object per-entity không shared). Job này là SAFETY NET cho trường hợp compensated-delete lỗi / upload
//   xong mà ghi ref thất bại.
// Quyết định xoá phải THẬN TRỌNG (rủi ro xoá object đang dùng): CHỈ xoá khi object CŨ HƠN grace window
//   (chống race: vừa upload xong, chưa kịp ghi ref) VÀ path KHÔNG nằm trong tập được tham chiếu. PURE.
// ============================================================

// created_at ISO của object; path (trong bucket); referenced = tập path đang được DB tham chiếu;
// graceDays = cửa sổ an toàn (Owner chỉnh qua STORAGE_ORPHAN_GRACE_DAYS, mặc định 7); nowMs = mốc so.
export function isOrphanObject(
  createdAtIso: string,
  path: string,
  referenced: Set<string>,
  graceDays: number,
  nowMs: number,
): boolean {
  const created = Date.parse(createdAtIso)
  if (Number.isNaN(created)) return false // không rõ tuổi → KHÔNG xoá (an toàn)
  if (referenced.has(path)) return false // đang được tham chiếu → giữ
  const ageMs = nowMs - created
  const graceMs = Math.max(0, graceDays) * 24 * 60 * 60 * 1000
  return ageMs > graceMs // chỉ xoá khi đã qua grace (đủ lâu để chắc không phải upload đang chờ ghi ref)
}

// Grace window (ngày) từ env — Owner chỉnh không cần đổi code. Mặc định 7. Không hợp lệ → 7.
export function orphanGraceDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.STORAGE_ORPHAN_GRACE_DAYS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 7
}

// Cleanup có XOÁ THẬT hay chỉ dry-run (quan sát)? Mặc định dry-run (an toàn) — Owner bật sau khi verify
//   trên staging rằng reference-check đúng (chống xoá object đang dùng). STORAGE_ORPHAN_CLEANUP_ENABLED=true.
export function orphanCleanupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STORAGE_ORPHAN_CLEANUP_ENABLED === 'true'
}
