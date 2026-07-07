import Link from 'next/link'

// W12 — Admin dashboard (M11). Layout đã server-gate requireAdmin. Static (markup-only) theo design frame 3.
// Số liệu thống kê chưa có endpoint riêng → để placeholder "—" (không bịa số, không thêm data flow).
const stats = [
  { label: 'Đề đã publish' },
  { label: 'Đề nháp' },
  { label: 'Sản phẩm' },
]

const actions = [
  {
    href: '/admin/tests/new',
    title: 'Tạo đề mới',
    desc: 'Passage + câu hỏi + đáp án (tách) → lưu draft → preview → publish.',
    cta: 'Bắt đầu →',
    iconBg: '#F0ECFF',
    iconDot: '#7C5CE6',
  },
  {
    href: '/admin/products',
    title: 'Sản phẩm / Bundle',
    desc: 'Tạo product/bundle → gắn đề + đặt giá → publish ra catalog.',
    cta: 'Quản lý →',
    iconBg: '#FFEDE6',
    iconDot: '#F2724E',
  },
  {
    href: '/admin/activation-codes',
    title: 'Mã kích hoạt',
    desc: 'Sinh mã theo sản phẩm → hiển thị 1 lần + tải CSV. Chỉ lưu bản băm.',
    cta: 'Sinh mã →',
    iconBg: '#FFF3DC',
    iconDot: '#ECA22B',
  },
  {
    href: '/admin/grants',
    title: 'Cấp quyền',
    desc: 'Cấp trực tiếp VOL cho 1 tài khoản (email) — không cần key, không trừ xu.',
    cta: 'Cấp quyền →',
    iconBg: '#E7F7EE',
    iconDot: '#1E9E63',
  },
]

export default function AdminDashboard() {
  return (
    <div className="text-[#2A2740]">
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Bảng điều khiển</h1>
      <p className="mt-1.5 text-[14.5px] font-semibold text-[#857F96]">
        Tạo và xuất bản đề thi. Đáp án được tách riêng và chỉ lưu server-side.
      </p>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[15px] border border-[#EBE8F1] bg-white px-5 py-[18px]">
            <div className="text-[12px] font-bold uppercase tracking-[0.04em] text-[#9088A2]">{s.label}</div>
            <div className="mt-2 text-[30px] font-extrabold tracking-[-0.02em] text-[#2A2740]">—</div>
          </div>
        ))}
      </div>

      {/* Action cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-[16px] border border-[#E7E4EE] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[#7C5CE6] hover:shadow-[0_18px_36px_-26px_rgba(124,92,230,0.4)]"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-[12px]"
              style={{ background: a.iconBg }}
            >
              <span className="block h-[15px] w-[15px] rotate-45 rounded-[4px]" style={{ background: a.iconDot }} />
            </span>
            <div className="mt-[15px] text-[16.5px] font-extrabold">{a.title}</div>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[#6A6480]">{a.desc}</p>
            <div className="mt-4 text-[14px] font-bold text-[#6A48D6]">{a.cta}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
