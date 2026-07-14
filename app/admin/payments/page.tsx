import { requireAdmin } from '@/lib/auth/guards'
import { AdminPaymentExceptions } from '@/components/admin/AdminPaymentExceptions'

// PAY-004 — Đối soát thanh toán (M08/M12). Layout đã server-gate requireAdmin; page tự guard lại (defense-in-depth).
//   Danh sách case lệch tiền (webhook đã verify chữ ký nhưng số tiền không khớp) → xem + đóng case.
//   KHÔNG credit ở đây: cấp coin bù (nếu Owner duyệt) qua trang Người dùng (điều chỉnh coin có ledger).
export default async function AdminPaymentsPage() {
  const g = await requireAdmin()
  if (!g.ok) return null
  return (
    <div>
      <h1 className="mb-1 text-[19px] font-extrabold text-[#2A2740]">Đối soát thanh toán</h1>
      <p className="mb-4 text-[13px] text-[#6A6480]">
        Case lệch tiền được ghi bền + chống trùng. Đóng case KHÔNG tự cộng coin — nếu cần bù, dùng trang
        Người dùng (điều chỉnh coin có ghi sổ).
      </p>
      <AdminPaymentExceptions />
    </div>
  )
}
