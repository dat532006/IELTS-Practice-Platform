import { AdminTestForm } from '@/components/admin/AdminTestForm'
import '@/app/exam.css'

// W12 — Trang tạo đề (M11). Layout đã server-gate requireAdmin; form là client.
// exam.css (scoped .dc-exam) cho preview giao diện thi thật ngay trong form (2026-07-08).
export default function NewTestPage() {
  return <AdminTestForm />
}
