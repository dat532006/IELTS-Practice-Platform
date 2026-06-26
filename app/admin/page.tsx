import Link from 'next/link'

// W12 — Admin dashboard (M11). Layout đã server-gate requireAdmin.
export default function AdminDashboard() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-800">Bảng điều khiển</h1>
      <p className="mb-5 text-sm text-slate-500">Tạo và xuất bản đề thi. Đáp án được tách riêng và chỉ lưu server-side.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/admin/tests/new"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-teal-400 hover:shadow-sm"
        >
          <div className="font-semibold text-slate-800">➕ Tạo đề mới</div>
          <div className="mt-1 text-sm text-slate-500">Passage + câu hỏi + đáp án (tách) → lưu draft → preview → publish.</div>
        </Link>
        <Link
          href="/admin/products"
          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-teal-400 hover:shadow-sm"
        >
          <div className="font-semibold text-slate-800">📦 Sản phẩm / Bundle</div>
          <div className="mt-1 text-sm text-slate-500">Tạo product/bundle → gắn đề + đặt giá → publish ra catalog.</div>
        </Link>
      </div>
    </div>
  )
}
