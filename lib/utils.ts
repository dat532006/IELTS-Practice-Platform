import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Route param `[id]` phải là UUID. Chặn trước khi query (Postgres 22P02 → tránh 500 INTERNAL sai envelope).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

// Chống open-redirect cho `?next=` (login/callback): CHỈ chấp nhận path nội bộ an toàn.
// Loại URL tuyệt đối, protocol-relative `//host`, và backslash-trick `/\host`.
// Loại ký tự điều khiển: URL parser của trình duyệt BỎ TAB/LF/CR nên "/<TAB>/evil.com" thành "//evil.com"
//   (lọt 2 check trên). Chốt cuối: resolve thử phải còn cùng origin.
const DUMMY_ORIGIN = 'http://next-path.invalid'
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || typeof next !== 'string') return fallback
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return fallback
  }
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  try {
    if (new URL(next, DUMMY_ORIGIN).origin !== DUMMY_ORIGIN) return fallback
  } catch {
    return fallback
  }
  return next
}
