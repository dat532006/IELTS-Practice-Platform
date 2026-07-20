import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guards'
import { AdminShell } from '@/components/admin/AdminShell'
import { SkipLink } from '@/components/layout/SkipLink'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    if (gate.reason === 'UNAUTHORIZED') redirect('/login?next=/admin')
    return (
      <main id="main-content" className="grid min-h-screen place-items-center bg-[#FBFBFD] px-4 text-center text-[var(--text-muted)]">
        <div>
          <h1 className="mb-2 text-lg font-bold text-[#2A2740]">403 — Không có quyền</h1>
          <p className="mb-3 text-sm">Trang quản trị chỉ dành cho admin.</p>
          <Link href="/" className="inline-flex min-h-[44px] items-center font-semibold text-[#5B43C7] underline">
            ← Về trang chủ
          </Link>
        </div>
      </main>
    )
  }

  return (
    <>
      <SkipLink />
      <AdminShell email={gate.user.email ?? null} userId={gate.user.id}>
        {children}
      </AdminShell>
    </>
  )
}