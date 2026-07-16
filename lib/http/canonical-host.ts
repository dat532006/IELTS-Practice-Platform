// ============================================================
// AUTH-007 — Canonical host + cứu mã OAuth đi lạc (Owner báo 2026-07-17).
// Triệu chứng: login Google trên ieltspracticeplatform.online → Supabase trả về
//   ielts-practice-platform-8rzx-eta.vercel.app/?code=<uuid> → vẫn "Log in" (không có session).
// Gốc: Site URL/allowlist Supabase còn trỏ vercel.app → redirect_to bị từ chối → rơi về Site URL,
//   đáp xuống '/' (không phải /auth/callback) nên code KHÔNG BAO GIỜ được đổi thành session; và app
//   sống trên 2 origin nên cookie (session + PKCE verifier) tách đôi — login origin này, origin kia mù.
// Fix config là việc Owner (dashboard), nhưng code phải TỰ PHỤC HỒI khi config drift:
//   1) canonicalRedirectTarget — production: mọi request tới host lạ (vd *.vercel.app) 308 về đúng
//      NEXT_PUBLIC_SITE_URL, giữ nguyên path+query. App chỉ còn MỘT origin → cookie hết tách đôi.
//      KHÔNG đụng: preview/dev (VERCEL_ENV ≠ production), /api/* (webhook SePay + Vercel Cron bắn
//      thẳng vào deployment URL và KHÔNG chắc follow redirect — 308 là mất webhook).
//   2) strayAuthCodeRescue — GET '/' mang ?code=<uuid> (đúng dấu vân của Site-URL fallback) →
//      chuyển tới /auth/callback giữ nguyên query để đổi code thành session. Sau bước (1) request đã
//      về canonical host nên cookie PKCE verifier CÓ MẶT → exchange thành công.
// PURE: không import → Node type-strip test trực tiếp; middleware (edge) import được.
// ============================================================

export type CanonicalInput = {
  host: string | null // request Host header (có thể kèm :port)
  pathname: string
  search: string // '' hoặc '?...'
  siteUrl: string | undefined // NEXT_PUBLIC_SITE_URL
  vercelEnv: string | undefined // VERCEL_ENV: production | preview | development
}

// URL tuyệt đối để 308, hoặc null = không đụng. Fail-open có chủ đích: config thiếu/hỏng thì KHÔNG
//   redirect (thà chạy trên host phụ còn hơn loop/chết cả site vì một biến env xấu).
export function canonicalRedirectTarget(input: CanonicalInput): string | null {
  if (input.vercelEnv !== 'production') return null // preview/dev giữ nguyên host của nó
  if (!input.host) return null
  if (input.pathname === '/api' || input.pathname.startsWith('/api/')) return null // webhook/cron
  const raw = (input.siteUrl ?? '').trim()
  if (!/^https:\/\//i.test(raw)) return null // prod canonical phải là https tường minh
  let canonical: URL
  try {
    canonical = new URL(raw)
  } catch {
    return null
  }
  const reqHost = input.host.trim().toLowerCase()
  if (reqHost === canonical.host.toLowerCase()) return null // đã đúng nhà
  return `${canonical.origin}${input.pathname}${input.search}`
}

// Mã PKCE của Supabase là UUID — chỉ cứu đúng định dạng đó, không đụng ?code= của tính năng khác.
const AUTH_CODE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Đường dẫn tương đối tới /auth/callback (giữ nguyên query), hoặc null = không đụng.
//   CHỈ cứu ở '/' — đó là nơi Site-URL fallback đáp; các path khác giữ nguyên hành vi.
export function strayAuthCodeRescue(pathname: string, search: string): string | null {
  if (pathname !== '/') return null
  if (!search || search === '?') return null
  const code = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('code')
  if (!code || !AUTH_CODE_RE.test(code)) return null
  return `/auth/callback${search}`
}
