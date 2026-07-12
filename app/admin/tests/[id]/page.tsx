import { AdminTestForm } from '@/components/admin/AdminTestForm'
import '@/app/exam.css'

// Sửa đề đã tạo (M11 mở rộng, 2026-07-12). Layout đã server-gate requireAdmin.
// Form tự fetch /api/admin/tests/[id]/preview để đổ dữ liệu (gồm answer_keys — kênh admin riêng).
export default async function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminTestForm testId={id} />
}
