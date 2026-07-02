import { AdminActivationCodeGenerator } from '@/components/admin/AdminActivationCodeGenerator'

// W14 — Trang sinh mã kích hoạt (M11). Layout đã server-gate requireAdmin; generator là client.
// (FE-F02: port từ branch w14/frontend-activation-codes — file chưa từng lên main trước đây.)
export default function AdminActivationCodesPage() {
  return <AdminActivationCodeGenerator />
}
