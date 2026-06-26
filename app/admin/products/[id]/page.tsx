import { AdminProductDetail } from '@/components/admin/AdminProductDetail'

// W13 — Trang quản lý 1 sản phẩm (M11/M04). Layout đã server-gate requireAdmin; detail là client.
export default async function AdminProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminProductDetail productId={id} />
}
