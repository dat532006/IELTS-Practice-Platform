// W9 parity (capture): icon cờ bookmark (flag) thay ★ — filled cam khi đã đánh dấu, outline khi chưa.
export function BookmarkFlag({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className ?? 'h-4 w-4'}
      fill={filled ? '#F2A93B' : 'none'}
      stroke={filled ? '#F2A93B' : 'currentColor'}
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M6 3h12v18l-6-5-6 5z" />
    </svg>
  )
}
