import { AdminUserDetail } from '@/components/admin/AdminUserDetail'

// Hồ sơ người dùng (M11 mở rộng, 2026-07-12). Layout đã server-gate requireAdmin.
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminUserDetail userId={id} />
}
