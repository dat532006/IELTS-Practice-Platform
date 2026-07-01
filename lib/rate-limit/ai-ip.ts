import 'server-only'
import { createHash } from 'node:crypto'

const DEFAULT_IP_DAILY_LIMIT = 20
const FALLBACK_PEPPER = 'local-dev-ai-ip-rate-limit'

export function getAiGradeIpDailyLimit(): number {
  const raw = Number.parseInt(process.env.AI_GRADE_IP_DAILY_LIMIT ?? '', 10)
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_IP_DAILY_LIMIT
  return Math.min(raw, 500)
}

// F4 — CHỈ tin header do NỀN TẢNG chèn (client KHÔNG giả mạo được):
//   • cf-connecting-ip (Cloudflare) • x-vercel-forwarded-for (Vercel).
//   x-real-ip / x-forwarded-for do client gửi có thể bị spoof → CHỈ dùng khi tự-host sau proxy tin cậy
//   và bật opt-in TRUST_FORWARDED_IP=1. Không có IP tin cậy → 'unknown' (per-user quota vẫn chặn abuse).
export function extractTrustedClientIp(headers: Headers): string {
  const trusted = [headers.get('cf-connecting-ip'), headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()]
  const platform = trusted.find((v) => v && v.length <= 128)
  if (platform) return platform
  if (process.env.TRUST_FORWARDED_IP === '1') {
    const fwd = [headers.get('x-real-ip'), headers.get('x-forwarded-for')?.split(',')[0]?.trim()].find(
      (v) => v && v.length <= 128,
    )
    if (fwd) return fwd
  }
  return 'unknown'
}

// F3 — pepper RIÊNG cho băm IP; KHÔNG tái dùng SUPABASE_SERVICE_ROLE_KEY (tránh key-reuse / coupling rotation).
//   Thiếu AI_GRADE_IP_RATE_LIMIT_PEPPER → FALLBACK_PEPPER (chỉ ảnh hưởng tính ổn định của rate-limit IP,
//   KHÔNG lộ secret vì output đã là SHA-256). Prod NÊN set pepper riêng.
export function hashAiGradeIp(ip: string): string {
  const pepper = process.env.AI_GRADE_IP_RATE_LIMIT_PEPPER || FALLBACK_PEPPER
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex')
}
