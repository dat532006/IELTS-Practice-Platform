// Field & UI icons (stroke = currentColor) — auth forms, catalog, detail.
// Paths lift từ design handoff. Google G giữ 4 màu chuẩn (không dùng gradient).
import type { SVGProps } from 'react'

type IconProps = { size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>

function base(size: number, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function MailIcon({ size = 16, strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <rect x="3" y="5" width="18" height="14" rx="3.5" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </svg>
  )
}

export function LockIcon({ size = 16, strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function UserIcon({ size = 16, strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c0-4 3.6-6.2 7.5-6.2S19.5 16 19.5 20" />
    </svg>
  )
}

export function SearchIcon({ size = 17, strokeWidth = 2.2, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}

export function EyeIcon({ size = 17, strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon({ size = 17, strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M10.6 6.1A9.3 9.3 0 0 1 12 6c6.5 0 10 6 10 6a13.2 13.2 0 0 1-2.2 2.9M6.1 6.1A13 13 0 0 0 2 12s3.5 6 10 6a9.3 9.3 0 0 0 3.9-.8" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

export function CheckIcon({ size = 12, strokeWidth = 3.2, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M5 12l4.5 4.5L19 7" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 15, strokeWidth = 2.4, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function KeyIcon({ size = 30, strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} {...rest}>
      <circle cx="9" cy="9" r="4" />
      <path d="M12 12l7 7" />
      <path d="M17 15l2.5-2.5" />
      <path d="M15 17l2.5-2.5" />
    </svg>
  )
}

// Google "G" — 4 màu chuẩn, viewBox 48.
export function GoogleGIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.9 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.94 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
