// Brand mascot — chibi line-art cat "5f" (wink + sparkle) từ design handoff.
// Dùng trong header, auth shell, favicon. Paths lift trực tiếp từ IELTSPractice Screens.dc.html.
export function Mascot({ size = 46, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="IELTSPractice mascot"
    >
      <path
        d="M18 28 L20 14 Q22 12 24 15 L29 25 Z"
        fill="#fff"
        stroke="#3A2E5C"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path
        d="M46 28 L44 14 Q42 12 40 15 L35 25 Z"
        fill="#fff"
        stroke="#3A2E5C"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path d="M21.5 24 L22.5 17.5 L26 23 Z" fill="#F7B8D2" />
      <path d="M42.5 24 L41.5 17.5 L38 23 Z" fill="#F7B8D2" />
      <ellipse cx="32" cy="36" rx="17" ry="15" fill="#fff" stroke="#3A2E5C" strokeWidth="2.3" />
      <ellipse cx="26" cy="37" rx="4.3" ry="5.1" fill="#3A2E5C" />
      <circle cx="24.7" cy="35.2" r="1.7" fill="#fff" />
      <path d="M34 38 q4 -4 8 0" stroke="#3A2E5C" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="20.5" cy="41" rx="3" ry="2" fill="#F58BB4" opacity="0.7" />
      <ellipse cx="43.5" cy="41" rx="3" ry="2" fill="#F58BB4" opacity="0.7" />
      <path
        d="M32 40 q-1.5 -0.1 -1.5 1 q0 .9 1.5 1.6 q1.5 -.7 1.5 -1.6 q0 -1.1 -1.5 -1 Z"
        fill="#E98BA6"
      />
      <path d="M50 12 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#FACC15" />
      <path d="M13 20 l.9 2.2 2.2 .9 -2.2 .9 -.9 2.2 -.9 -2.2 -2.2 -.9 2.2 -.9 Z" fill="#EE5C92" />
    </svg>
  )
}
