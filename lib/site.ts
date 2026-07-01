// W19 (M10) — nguồn URL/branding công khai cho SEO (metadataBase, robots, sitemap, OG).
// SITE_URL: production domain. Đọc từ NEXT_PUBLIC_SITE_URL (Owner set khi deploy); fallback local dev.
// Không phải secret → NEXT_PUBLIC_ hợp lệ (chỉ là base URL công khai).
const RAW = process.env.NEXT_PUBLIC_SITE_URL?.trim()

export const SITE_URL = (RAW && /^https?:\/\//.test(RAW) ? RAW : 'http://localhost:3000').replace(/\/$/, '')
export const SITE_NAME = 'IELTS Practice Platform'
export const SITE_DESCRIPTION =
  'Luyện thi IELTS Reading / Listening / Writing — giao diện chuẩn thi thật, chấm điểm phía máy chủ, phản hồi AI cho Writing.'
