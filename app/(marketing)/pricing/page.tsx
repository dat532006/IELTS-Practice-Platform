'use client'

import { useState } from 'react'
import { COIN_VND_RATE, MIN_TOPUP_VND, MAX_TOPUP_VND } from '@/lib/payments/topup-constants'

// W16 — Trang nạp coin (M08). Fixed-rate 1.000 VND = 1 coin. Client CHỈ gửi { amount_vnd, provider };
//   server tự tính coin (KHÔNG hard-code coin ở client — preview chỉ để hiển thị, server là nguồn sự thật).
const QUICK_VND = [60_000, 100_000, 200_000, 500_000]
const PROVIDERS = [
  { id: 'vnpay', label: 'VNPay' },
  { id: 'momo', label: 'MoMo' },
  { id: 'bank', label: 'Chuyển khoản' },
] as const

const vnd = (n: number) => n.toLocaleString('vi-VN')

export default function PricingPage() {
  const [amount, setAmount] = useState(100_000)
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]['id']>('vnpay')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isInt = Number.isInteger(amount)
  const divisible = isInt && amount % COIN_VND_RATE === 0
  const inRange = amount >= MIN_TOPUP_VND && amount <= MAX_TOPUP_VND
  const valid = divisible && inRange
  const previewCoins = divisible ? amount / COIN_VND_RATE : Math.floor(amount / COIN_VND_RATE)

  async function topUp() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_vnd: amount, provider }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 401) setError('Bạn cần đăng nhập để nạp coin.')
        else setError(body?.message ?? 'Không khởi tạo được thanh toán.')
        return
      }
      const url = body?.data?.redirect_url
      if (url) window.location.href = url
      else setError('Thiếu redirect URL từ cổng thanh toán.')
    } catch {
      setError('Lỗi mạng, vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Nạp coin</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tỷ giá cố định <span className="font-medium text-slate-700">{vnd(COIN_VND_RATE)} VND = 1 coin</span>. Thanh toán
        xác minh ở server (VNPay/MoMo/chuyển khoản).
      </p>

      {/* Quick-select */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_VND.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(q)}
            className={`rounded-lg border p-4 text-center transition ${
              amount === q ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-lg font-extrabold text-teal-700">🪙 {q / COIN_VND_RATE}</div>
            <div className="mt-1 text-xs text-slate-500">{vnd(q)} VND</div>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <label className="mt-6 block text-sm font-medium text-slate-700">Hoặc nhập số tiền (VND)</label>
      <input
        type="number"
        inputMode="numeric"
        step={COIN_VND_RATE}
        min={MIN_TOPUP_VND}
        max={MAX_TOPUP_VND}
        value={Number.isNaN(amount) ? '' : amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-slate-300 px-4 py-2 text-sm outline-none focus:border-teal-600"
      />

      {/* Provider */}
      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProvider(p.id)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              provider === p.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Preview + validation */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500">Bạn sẽ nhận</span>
          <span className="text-xl font-bold text-slate-900">🪙 {valid ? previewCoins : '—'} coins</span>
        </div>
        {valid && (
          <p className="mt-1 text-right text-xs text-slate-400">
            {vnd(amount)} VND = {previewCoins} coins
          </p>
        )}
      </div>
      {!valid && (
        <p className="mt-2 text-sm text-amber-700">
          {!isInt || amount <= 0
            ? 'Nhập số tiền hợp lệ.'
            : !inRange
              ? `Số tiền nạp từ ${vnd(MIN_TOPUP_VND)} đến ${vnd(MAX_TOPUP_VND)} VND.`
              : `Số tiền phải chia hết cho ${vnd(COIN_VND_RATE)} VND.`}
        </p>
      )}

      <button
        type="button"
        onClick={topUp}
        disabled={!valid || loading}
        className="mt-5 w-full rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Đang chuyển đến cổng thanh toán…' : `Nạp ${valid ? vnd(amount) + ' VND' : ''}`}
      </button>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  )
}
