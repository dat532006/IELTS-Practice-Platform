'use client'

// Error boundary cho /products: lỗi tải catalog (vd Supabase env/API) → retry rõ ràng.
export default function ProductsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">Không tải được danh sách bộ đề</h1>
      <p className="mt-2 text-sm text-slate-500">
        Có lỗi khi tải dữ liệu (có thể do kết nối / cấu hình). Vui lòng thử lại.
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
      >
        Thử lại
      </button>
    </div>
  )
}
