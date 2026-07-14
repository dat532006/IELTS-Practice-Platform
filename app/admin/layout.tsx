import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guards'
import { AdminAccountBar } from '@/components/admin/AdminAccountBar'

// W12 — Admin layout (M11). SERVER gate: requireAdmin() là guard THẬT (UI chỉ tiện ích).
//   UNAUTHORIZED → /login; FORBIDDEN → 403 UI (không render children). Chrome admin riêng (design frame 3).
const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/products', label: 'Sản phẩm' },
  { href: '/admin/tests', label: 'Đề thi' },
  { href: '/admin/users', label: 'Người dùng' },
  { href: '/admin/activation-codes', label: 'Mã kích hoạt' },
  { href: '/admin/grants', label: 'Cấp quyền' },
  { href: '/admin/payments', label: 'Đối soát' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const g = await requireAdmin()
  if (!g.ok) {
    if (g.reason === 'UNAUTHORIZED') redirect('/login?next=/admin')
    return (
      <div className="grid min-h-screen place-items-center bg-[#FBFBFD] px-4 text-center text-[#564F6B]">
        <div>
          <p className="mb-2 text-lg font-bold text-[#2A2740]">403 — Không có quyền</p>
          <p className="mb-3 text-sm">Trang quản trị chỉ dành cho admin.</p>
          <Link href="/" className="font-semibold text-[#6A48D6] underline">
            ← Về trang chủ
          </Link>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-[#FBFBFD] text-[#2A2740]">
      <header className="border-b border-[#EBE8F1] bg-white px-4 py-3.5">
        <div className="mx-auto flex max-w-6xl items-center gap-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#2A2740] text-[12px] font-extrabold text-white">
            AD
          </span>
          <Link href="/admin" className="text-[15px] font-extrabold text-[#2A2740]">
            Quản trị nội dung
          </Link>
          <nav className="ml-[18px] flex gap-1.5">
            {navItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rounded-[9px] px-3 py-[7px] text-[13px] font-semibold text-[#6A6480] transition hover:bg-[#F2EFF7]"
              >
                {it.label}
              </Link>
            ))}
          </nav>
          {/* Email admin đang đăng nhập (link hồ sơ chi tiết) + Đăng xuất (2026-07-12) */}
          <AdminAccountBar email={g.user.email ?? null} userId={g.user.id} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
