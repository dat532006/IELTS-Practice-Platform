// Panel CTA mua/nhập mã cho product detail. owned → panel sở hữu. KHÔNG link route chưa tồn tại:
// checkout/redeem thật là M08 (W15–16) → nút placeholder DISABLED + note (tránh affordance giả/404).
export function PurchaseCta({ priceCoins, owned }: { priceCoins: number; owned: boolean }) {
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
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled
          title="Thanh toán mở ở giai đoạn sau (W15–16)"
          className="inline-flex items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mua bằng coin
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            title="Giỏ hàng mở ở giai đoạn sau (W15–16)"
            className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Thêm vào giỏ
          </button>
          <button
            type="button"
            disabled
            title="Nhập mã kích hoạt mở ở giai đoạn sau (W15–16)"
            className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Nhập mã
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Thanh toán & nhập mã sẽ mở ở giai đoạn sau.</p>
    </div>
  )
}
