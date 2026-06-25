import 'server-only'
import { createHash } from 'node:crypto'

const DEFAULT_IP_DAILY_LIMIT = 20
const FALLBACK_PEPPER = 'local-dev-ai-ip-rate-limit'

export function getAiGradeIpDailyLimit(): number {
  const raw = Number.parseInt(process.env.AI_GRADE_IP_DAILY_LIMIT ?? '', 10)
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_IP_DAILY_LIMIT
  return Math.min(raw, 500)
}

export function extractTrustedClientIp(headers: Headers): string {
  // Assumes the hosting proxy strips spoofed inbound values before forwarding.
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-vercel-forwarded-for'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ]
  return candidates.find((v) => v && v.length <= 128) ?? 'unknown'
}

export function hashAiGradeIp(ip: string): string {
  const pepper = process.env.AI_GRADE_IP_RATE_LIMIT_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_PEPPER
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex')
}
