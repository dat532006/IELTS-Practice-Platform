import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guards'

// W12 — Admin layout (M11). SERVER gate: requireAdmin() là guard THẬT (UI chỉ tiện ích).
//   UNAUTHORIZED → /login; FORBIDDEN → 403 UI (không render children). Chrome admin riêng (no marketing).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const g = await requireAdmin()
  if (!g.ok) {
    if (g.reason === 'UNAUTHORIZED') redirect('/login?next=/admin')
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center text-slate-700">
        <div>
          <p className="mb-2 text-lg font-semibold">403 — Không có quyền</p>
          <p className="mb-3 text-sm">Trang quản trị chỉ dành cho admin.</p>
          <Link href="/" className="text-teal-700 underline">← Về trang chủ</Link>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded bg-slate-900 text-xs font-bold text-white">AD</span>
          <Link href="/admin" className="font-semibold">Quản trị nội dung</Link>
          <span className="ml-auto text-xs text-slate-500">Admin · IELTS Platform</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
