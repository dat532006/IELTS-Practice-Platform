// ============================================================
// STORE-003 — Validate URL ảnh công khai (cover_image). Trước đây cover_image chỉ qua z.string().url()
//   → URL constructor CHẤP NHẬN 'javascript:...', 'data:...', host bất kỳ (tracker/độc hại) → lưu + render
//   công khai. Fix: chỉ chấp nhận URL có ORIGIN thuộc allowlist (mặc định = origin Supabase Storage public
//   nơi admin upload) VÀ path bắt đầu '/storage/v1/object/public/'. Origin-match tự ép đúng scheme
//   (prod Supabase = https; local = http) — javascript:/data: có origin 'null' → loại.
//   Owner mở rộng origin qua env MEDIA_ALLOWED_ORIGINS (comma-sep) nếu dùng CDN. PURE (test Node được).
// ============================================================

const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/'

export function getAllowedMediaOrigins(): Set<string> {
  const set = new Set<string>()
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (sb) { try { set.add(new URL(sb).origin) } catch { /* ignore */ } }
  const extra = process.env.MEDIA_ALLOWED_ORIGINS // Owner: origin CDN bổ sung, phân tách bằng dấu phẩy
  if (extra) for (const o of extra.split(',')) { try { set.add(new URL(o.trim()).origin) } catch { /* ignore */ } }
  return set
}

// true nếu là URL ảnh công khai HỢP LỆ: origin ∈ allowlist + path là object public. Ngược lại (scheme lạ,
//   host lạ, javascript:/data:, path không phải public) → false.
export function isAllowedPublicMediaUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (!getAllowedMediaOrigins().has(u.origin)) return false
  if (!u.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return false
  return true
}

// STORE-001 — tách {bucket, path} từ URL công khai để xoá object CŨ khi thay/gỡ cover/avatar
//   (compensated-delete). Chỉ nhận URL hợp lệ (origin allowlist + object public) → KHÔNG suy ra bucket/path
//   từ URL lạ (chống xoá nhầm). Format: {origin}/storage/v1/object/public/{bucket}/{path}. PURE.
export function parsePublicObjectPath(raw: unknown): { bucket: string; path: string } | null {
  if (!isAllowedPublicMediaUrl(raw)) return null
  const u = new URL(raw as string)
  const rest = decodeURIComponent(u.pathname.slice(PUBLIC_OBJECT_PREFIX.length)) // "{bucket}/{path...}"
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null // cần cả bucket lẫn path không rỗng
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) }
}
