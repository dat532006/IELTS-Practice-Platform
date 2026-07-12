import { AdminTestList } from '@/components/admin/AdminTestList'

// Danh sách đề (M11 mở rộng, 2026-07-12). Layout đã server-gate requireAdmin; list là client gọi API.
export default function AdminTestsPage() {
  return <AdminTestList />
}
