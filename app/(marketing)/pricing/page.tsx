const PACKS = [
  { coins: 100, price: '49.000đ' },
  { coins: 250, price: '99.000đ' },
  { coins: 600, price: '199.000đ' },
]

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold">Bảng giá coin</h1>
      <p className="mt-1 text-sm text-slate-500">
        Mua coin để mở khóa product/bundle. Thanh toán xác minh ở server (VNPay/MoMo/chuyển khoản).
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PACKS.map((p) => (
          <div key={p.coins} className="rounded-lg border border-slate-200 p-5 text-center">
            <div className="text-3xl font-extrabold text-teal-700">🪙 {p.coins}</div>
            <div className="mt-2 text-slate-700">{p.price}</div>
            <button className="mt-4 w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
              Nạp (sắp có)
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
