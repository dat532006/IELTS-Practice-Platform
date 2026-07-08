'use client'

import { useState } from 'react'
import { COIN_VND_RATE, MIN_TOPUP_VND, MAX_TOPUP_VND } from '@/lib/payments/topup-constants'
import { PaymentDisclaimer } from '@/components/payment/PaymentDisclaimer'
import { FishBone } from '@/components/brand/FishBone'

// W16 — Trang nạp coin (M08). Fixed-rate 1.000 VND = 1 coin. Client CHỈ gửi { amount_vnd, provider };
//   server tự tính coin (preview chỉ để hiển thị). Layout theo design "Purchase & Admin.dc.html" frame 1.
const QUICK_VND = [60_000, 100_000, 200_000, 500_000]
const ALL_PROVIDERS = [
  { id: 'vnpay', label: 'VNPay', mono: 'V', tint: '#E4EEFF', fg: '#2A63C7' },
  { id: 'momo', label: 'MoMo', mono: 'M', tint: '#FBE3F0', fg: '#C2186A' },
  { id: 'bank', label: 'Bank', mono: 'B', tint: '#E5F4EC', fg: '#1E9E63' },
] as const
type ProviderId = (typeof ALL_PROVIDERS)[number]['id']

// Chip hiển thị theo NEXT_PUBLIC_PAYMENT_PROVIDERS (vd "bank" | "bank,momo,vnpay") — Owner đóng
//   VNPay/MoMo tới khi có merchant (2026-07-08). Không phải secret; mặc định chỉ Bank (SePay live).
//   Server vẫn tự guard: provider chưa cấu hình → 503 dù client có gửi gì.
const ENABLED_IDS = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDERS ?? 'bank')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const PROVIDERS = ALL_PROVIDERS.filter((p) => ENABLED_IDS.includes(p.id))
const PROVIDER_LIST = PROVIDERS.length > 0 ? PROVIDERS : ALL_PROVIDERS.filter((p) => p.id === 'bank')

const vnd = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('vi-VN')

export default function PricingPage() {
  const [amount, setAmount] = useState(100_000)
  const [provider, setProvider] = useState<ProviderId>(PROVIDER_LIST[0].id)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isInt = Number.isInteger(amount)
  const divisible = isInt && amount % COIN_VND_RATE === 0
  const inRange = amount >= MIN_TOPUP_VND && amount <= MAX_TOPUP_VND
  const valid = amount > 0 && divisible && inRange
  const previewCoins = divisible ? amount / COIN_VND_RATE : Math.floor((amount || 0) / COIN_VND_RATE)

  const validationMsg = valid
    ? ''
    : !isInt || amount <= 0
      ? 'Nhập số tiền hợp lệ.'
      : !inRange
        ? `Số tiền nạp từ ${vnd(MIN_TOPUP_VND)} đến ${vnd(MAX_TOPUP_VND)} VND.`
        : `Số tiền phải chia hết cho ${vnd(COIN_VND_RATE)} VND.`

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
        if (res.status === 401) setError('Bạn cần đăng nhập để nạp xương cá.')
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
    <div className="mx-auto max-w-2xl px-4 py-10 text-[#2A2740]">
      <div
        className="overflow-hidden rounded-[24px] border border-[#EEEAF3] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.42)]"
        style={{
          background:
            'radial-gradient(120% 80% at 92% -10%, #FBE6DC 0%, rgba(251,230,220,0) 50%), radial-gradient(90% 60% at 0% -4%, #EFEAFF 0%, rgba(239,234,255,0) 46%), #FFFFFF',
        }}
      >
        <div className="px-6 py-9 sm:px-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#F0ECFF] px-3.5 py-2 text-[12.5px] font-bold text-[#6A48D6]">
            <span className="block h-[7px] w-[7px] rounded-full bg-[#7C5CE6]" />
            Tỷ giá cố định {vnd(COIN_VND_RATE)} VND = 1 xương cá
          </span>
          <h1 className="mt-4 text-[32px] font-extrabold leading-[1.06] tracking-[-0.025em]">Nạp xương cá</h1>

          {/* Quick select */}
          <div className="mt-7 text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-[#9088A2]">Chọn nhanh</div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {QUICK_VND.map((q) => {
              const sel = amount === q
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q)}
                  className={`rounded-[14px] p-4 text-center transition ${
                    sel
                      ? 'border-2 border-[#7C5CE6] bg-[#F6F2FF] shadow-[0_10px_22px_-12px_rgba(124,92,230,0.4)]'
                      : 'border border-[#E8E2F0] bg-white hover:border-[#CCC3DC]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[20px] font-extrabold tracking-[-0.02em] text-[#6A48D6]"><FishBone /> {q / COIN_VND_RATE}</div>
                  <div className="mt-1 text-[12.5px] font-semibold text-[#857F96]">{vnd(q)} ₫</div>
                </button>
              )
            })}
          </div>

          {/* Custom amount */}
          <div className="mt-6 text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-[#9088A2]">
            Hoặc nhập số tiền (VND)
          </div>
          <div className="mt-2.5 flex items-center gap-3 rounded-[14px] border border-[#E4DEEE] bg-white px-[18px] shadow-[0_6px_16px_rgba(42,39,64,0.04)] focus-within:border-[#7C5CE6]">
            <input
              type="number"
              inputMode="numeric"
              step={COIN_VND_RATE}
              min={MIN_TOPUP_VND}
              max={MAX_TOPUP_VND}
              value={Number.isNaN(amount) ? '' : amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 border-none bg-transparent py-4 font-mono text-[22px] font-extrabold text-[#2A2740] outline-none"
            />
            <span className="text-[14px] font-bold text-[#A8A2BA]">VND</span>
          </div>

          {/* Providers */}
          <div className="mt-6 text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-[#9088A2]">Cổng thanh toán</div>
          <div className="mt-2.5 flex flex-wrap gap-[11px]">
            {PROVIDER_LIST.map((p) => {
              const sel = provider === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`inline-flex items-center gap-2.5 rounded-[12px] px-4 py-[11px] text-[14px] font-bold transition ${
                    sel ? 'border-2 border-[#7C5CE6] bg-[#F6F2FF] text-[#5B43C7]' : 'border border-[#E8E2F0] bg-white text-[#3D3654] hover:border-[#CCC3DC]'
                  }`}
                >
                  <span
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-[13px] font-extrabold"
                    style={{ background: p.tint, color: p.fg }}
                  >
                    {p.mono}
                  </span>
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Preview */}
          <div className="mt-6 rounded-[16px] border border-[#E8E2F0] bg-[#FBFAFF] px-[22px] py-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold text-[#857F96]">Bạn sẽ nhận</span>
              <span className="inline-flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em] text-[#2A2740]">
                <FishBone /> {valid ? previewCoins : '—'}{' '}
                <span className="text-[15px] font-bold text-[#857F96]">xương cá</span>
              </span>
            </div>
            {valid && (
              <div className="mt-1.5 text-right font-mono text-[12.5px] font-semibold text-[#A8A2BA]">
                {vnd(amount)} VND = {previewCoins} xương cá
              </div>
            )}
          </div>

          {/* Validation */}
          {!valid && (
            <div className="mt-3 flex items-center gap-2.5 rounded-[12px] border border-[#F6E4C4] bg-[#FFF6E9] px-[15px] py-[11px] text-[13.5px] font-semibold text-[#A66A12]">
              <span className="h-[7px] w-[7px] flex-none rounded-full bg-[#E59A1B]" />
              {validationMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={topUp}
            disabled={!valid || loading}
            className={`mt-6 w-full rounded-[14px] p-4 text-[16px] font-bold text-white transition ${
              valid && !loading
                ? 'cursor-pointer bg-[#7C5CE6] shadow-[0_16px_30px_-12px_rgba(124,92,230,0.5)] hover:bg-[#6A48D6]'
                : 'cursor-not-allowed bg-[#D8D2E4] shadow-none'
            }`}
          >
            {loading ? 'Đang chuyển đến cổng thanh toán…' : valid ? `Nạp ${vnd(amount)} VND →` : 'Nạp xương cá'}
          </button>
          <div className="mt-3.5 text-center text-[12.5px] font-semibold text-[#A8A2BA]">
            🔒 Chuyển hướng tới cổng thanh toán an toàn
          </div>
          {error && <p className="mt-3 text-center text-[13.5px] font-semibold text-rose-600">{error}</p>}

          <PaymentDisclaimer className="mt-5" />
        </div>
      </div>
    </div>
  )
}
