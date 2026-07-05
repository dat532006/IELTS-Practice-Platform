import Link from 'next/link'
import { Mascot } from './Mascot'

// Logo lockup: mascot mèo + wordmark "IELTSPractice" (IELTS = brand violet).
// `href` null → render span (dùng khi đã ở trang chủ / trong context không cần link).
export function Logo({
  size = 46,
  textClassName = 'text-[20px]',
  href = '/',
  withShadow = true,
}: {
  size?: number
  textClassName?: string
  href?: string | null
  withShadow?: boolean
}) {
  const inner = (
    <>
      <span
        className="flex flex-none"
        style={withShadow ? { filter: 'drop-shadow(0 6px 11px rgba(90,60,160,.28))' } : undefined}
      >
        <Mascot size={size} />
      </span>
      <span className={`font-extrabold tracking-[-0.02em] ${textClassName}`}>
        <span className="text-[#7C5CE6]">IELTS</span>Practice
      </span>
    </>
  )

  if (href === null) {
    return <div className="flex items-center gap-[11px] text-[#2A2740]">{inner}</div>
  }
  return (
    <Link href={href} className="flex items-center gap-[11px] text-[#2A2740]">
      {inner}
    </Link>
  )
}
