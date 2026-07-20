import Link from 'next/link'
import { LEGAL_SLUG } from '@/lib/legal'

// W19 (M10/M08) — disclaimer thanh toán hiển thị rõ trên trang nạp coin (pricing) & CTA mua (purchase).
// Yêu cầu duyệt merchant/cổng thanh toán: link Chính sách thanh toán · Hoàn tiền · Điều kiện · Liên hệ luôn thấy được.
// Component không dùng hook → import được cả trong server & client tree. Link dùng legal slug đã có.
const LINKS: { slug: string; label: string }[] = [
  { slug: LEGAL_SLUG.PAYMENT_POLICY, label: 'Chính sách thanh toán' },
  { slug: 'refund', label: 'Hoàn tiền' },
  { slug: LEGAL_SLUG.TRANSACTION_TERMS, label: 'Điều kiện giao dịch' },
  { slug: 'contact', label: 'Liên hệ' },
]

export function PaymentDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-[12px] border border-[#ECE7F4] bg-[#FBFAFF] px-4 py-3 text-[12px] leading-[1.6] text-[var(--text-muted)] ${className}`}
    >
      <p>
        Khi thanh toán, bạn đồng ý với{' '}
        {LINKS.map((l, i) => (
          <span key={l.slug}>
            <Link href={`/legal/${l.slug}`} className="font-semibold text-[#6A48D6] hover:underline">
              {l.label}
            </Link>
            {i < LINKS.length - 1 ? (i === LINKS.length - 2 ? ' và ' : ', ') : '.'}
          </span>
        ))}
      </p>
      <p className="mt-1.5">
        Coin chỉ được cộng sau khi máy chủ xác minh giao dịch. Giá sản phẩm do máy chủ quyết định.
      </p>
    </div>
  )
}
