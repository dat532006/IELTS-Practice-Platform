// Currency icon — xương cá (fish bone), thay cho icon xu. Scale theo font-size (height 1.16em),
// đặt ngay cạnh số dư / giá. Paths lift từ design handoff.
export function FishBone({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 20"
      className={className}
      style={{ height: '1.16em', width: 'auto', verticalAlign: '-0.22em' }}
      role="img"
      aria-label="xương cá"
    >
      <path d="M9 10 L1.5 3.8 Q3.2 10 1.5 16.2 Z" fill="#6E93D6" />
      <rect x="7" y="8.6" width="13.5" height="2.8" rx="1.4" fill="#B9C6E0" />
      <g fill="none" stroke="#B9C6E0" strokeWidth="2" strokeLinecap="round">
        <path d="M10 9 C9.1 6.1 8.2 5 6.6 4.4" />
        <path d="M13.6 9 C12.7 6.1 11.8 5 10.2 4.4" />
        <path d="M17.2 9 C16.3 6.1 15.4 5 13.8 4.4" />
        <path d="M10 11 C9.1 13.9 8.2 15 6.6 15.6" />
        <path d="M13.6 11 C12.7 13.9 11.8 15 10.2 15.6" />
        <path d="M17.2 11 C16.3 13.9 15.4 15 13.8 15.6" />
      </g>
      <path
        d="M19.4 3 Q30.8 3.6 30.8 10 Q30.8 16.4 19.4 17 Q17.3 10 19.4 3 Z"
        fill="#6E93D6"
      />
      <ellipse
        cx="25.4"
        cy="6.6"
        rx="3"
        ry="1.5"
        fill="#fff"
        opacity="0.32"
        transform="rotate(-24 25.4 6.6)"
      />
      <path
        d="M22.7 10.7 Q24.7 12.7 26.7 10.7"
        fill="none"
        stroke="#2B2E38"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
