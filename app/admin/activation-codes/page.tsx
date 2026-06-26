import { AdminActivationCodeGenerator } from '@/components/admin/AdminActivationCodeGenerator'

// W14 — Trang sinh mã kích hoạt (M11). Layout đã server-gate requireAdmin; generator là client.
export default function AdminActivationCodesPage() {
  return <AdminActivationCodeGenerator />
}
