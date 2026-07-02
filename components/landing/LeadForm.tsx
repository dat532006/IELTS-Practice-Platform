import Link from 'next/link'

// FE-F08: form email cũ chỉ giả lập gửi (dữ liệu không đi đâu → hứa hẹn sai với user).
//   Thay bằng CTA tới kênh liên hệ thật (/legal/contact). Khi có backend lead-capture thì khôi phục form.
export function LeadForm() {
  return (
    <div className="lead-form" style={{ justifyContent: 'center' }}>
      <Link
        href="/legal/contact"
        className="btn-send"
        style={{ display: 'inline-flex', alignItems: 'center', padding: '14px 26px' }}
      >
        Contact our team →
      </Link>
    </div>
  )
}
