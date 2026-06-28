import { BuyButtons } from './BuyButtons'

// Panel CTA mua product detail (M08, W16). owned → panel sở hữu; free → panel free; còn lại → Buy-now coin.
// ⚠️ Normal purchase flow KHÔNG dùng activation code → KHÔNG nút "Nhập mã" ở đây (redeem chỉ cho admin/offline).
export function PurchaseCta({
  productId,
  priceCoins,
  owned,
}: {
  productId: string
  priceCoins: number
  owned: boolean
}) {
  if (owned) {
    return (
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
        <p className="font-medium text-teal-800">✓ Bạn đã sở hữu bộ đề này</p>
        {/* Copy trung tính: per-test unlock theo test_unlocks (cache), KHÔNG mặc định mọi đề đã mở (LUẬT THÉP #3). */}
        <p className="mt-1 text-sm text-teal-700">
          Các đề đã mở sẽ hiển thị trạng thái <span className="font-medium">Đã mở</span> trong mục lục bên dưới.
        </p>
      </div>
    )
  }

  if (priceCoins === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="font-medium text-emerald-800">Bộ đề miễn phí</p>
        <p className="mt-1 text-sm text-emerald-700">Chọn một đề trong mục lục bên dưới để làm thử.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900">🪙 {priceCoins}</span>
        <span className="text-sm text-slate-500">coins</span>
      </div>
      <BuyButtons productId={productId} priceCoins={priceCoins} />
      <p className="mt-2 text-xs text-slate-400">Trừ coin trong ví và mở khoá ngay sau khi mua.</p>
    </div>
  )
}
