'use client'

import Link from 'next/link'
import { COIN_VND_RATE } from '@/lib/payments/topup-constants'
import type { AccountTxn, TxnType } from './types'

const CARD =
  'rounded-[20px] border border-[#EEEAF3] bg-white p-[26px] shadow-[0_22px_44px_-36px_rgba(90,60,160,0.4)]'

// Fixed-rate 1.000 VND = 1 coin → gói nạp nhanh dùng đúng mô hình thật (KHÔNG bịa "+free").
const QUICK_VND = [60_000, 100_000, 200_000]
const vnd = (n: number) => n.toLocaleString('vi-VN')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' })

const PROVIDER_LABEL: Record<string, string> = {
  vnpay: 'VNPay',
  momo: 'MoMo',
  bank: 'Chuyển khoản',
  system: 'Hệ thống',
}
const TYPE_LABEL: Record<TxnType, string> = {
  topup: 'Nạp xương cá',
  spend: 'Mở khóa gói đề',
  refund: 'Hoàn xương cá',
  bonus: 'Thưởng xương cá',
  adjust: 'Điều chỉnh (trừ)', // admin trừ thủ công — amount dương, chiều trừ (khớp RPC admin_adjust_coins)
}
const STATUS_NOTE: Record<string, string> = { pending: 'đang xử lý', failed: 'thất bại', expired: 'hết hạn' }

// Xương cá trong banner (bản sáng màu để nổi trên nền tối #2A2740).
function FishBoneLight({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 20" style={{ height: size, width: 'auto' }} role="img" aria-label="xương cá">
      <path d="M9 10 L1.5 3.8 Q3.2 10 1.5 16.2 Z" fill="#8FB0E8" />
      <rect x="7" y="8.6" width="13.5" height="2.8" rx="1.4" fill="#CBD8EE" />
      <g fill="none" stroke="#CBD8EE" strokeWidth="2" strokeLinecap="round">
        <path d="M10 9 C9.1 6.1 8.2 5 6.6 4.4" />
        <path d="M13.6 9 C12.7 6.1 11.8 5 10.2 4.4" />
        <path d="M17.2 9 C16.3 6.1 15.4 5 13.8 4.4" />
        <path d="M10 11 C9.1 13.9 8.2 15 6.6 15.6" />
        <path d="M13.6 11 C12.7 13.9 11.8 15 10.2 15.6" />
        <path d="M17.2 11 C16.3 13.9 15.4 15 13.8 15.6" />
      </g>
      <path d="M19.4 3 Q30.8 3.6 30.8 10 Q30.8 16.4 19.4 17 Q17.3 10 19.4 3 Z" fill="#8FB0E8" />
      <path d="M22.7 10.7 Q24.7 12.7 26.7 10.7" fill="none" stroke="#2B2E38" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function WalletPanel({ coins, transactions }: { coins: number; transactions: AccountTxn[] }) {
  return (
    <section className={CARD}>
      <h2 className="text-[18px] font-extrabold tracking-[-0.01em] text-[#2A2740]">Xương cá</h2>

      {/* balance banner */}
      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[18px] bg-[#2A2740] px-6 py-[22px]">
        <span className="pointer-events-none absolute -top-[30px] right-10 h-[120px] w-[120px] rounded-full bg-[rgba(110,147,214,0.35)]" />
        <div className="relative">
          <div className="text-[12.5px] font-bold text-[#C8C2DA]">Số dư hiện tại</div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <FishBoneLight />
            <span className="text-[36px] font-extrabold tracking-[-0.02em] text-white">{coins}</span>
          </div>
        </div>
        <Link
          href="/pricing"
          className="relative inline-flex items-center gap-2 rounded-[13px] bg-[#7C5CE6] px-6 py-3 text-[15px] font-bold text-white shadow-[0_14px_28px_-8px_rgba(124,92,230,0.7)] transition hover:bg-[#6A48D6]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Nạp xương cá
        </Link>
      </div>

      {/* quick packs (fixed rate) */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {QUICK_VND.map((amount, i) => {
          const best = i === 1
          return (
            <Link
              key={amount}
              href="/pricing"
              className={`relative rounded-[14px] p-4 text-center transition hover:-translate-y-0.5 ${
                best ? 'border-2 border-[#7C5CE6] bg-[#FBF9FF]' : 'border border-[#EEEAF3] bg-white'
              }`}
            >
              {best && (
                <span className="absolute -top-[9px] left-1/2 -translate-x-1/2 rounded-full bg-[#7C5CE6] px-[9px] py-[3px] text-[10px] font-extrabold text-white">
                  PHỔ BIẾN
                </span>
              )}
              <div className="text-[20px] font-extrabold text-[#2A2740]">{amount / COIN_VND_RATE}</div>
              <div className="mt-0.5 text-[12px] font-bold text-[var(--text-subtle)]">xương cá · {vnd(amount)} ₫</div>
            </Link>
          )
        })}
      </div>

      {/* transaction history */}
      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-[14.5px] font-extrabold text-[#2A2740]">Lịch sử giao dịch</h3>
      </div>

      {transactions.length === 0 ? (
        <p className="mt-3 rounded-[14px] border border-[#F1EDF7] bg-[#FBFAFD] px-4 py-6 text-center text-[13.5px] font-semibold text-[var(--text-subtle)]">
          Chưa có giao dịch nào. <Link href="/pricing" className="font-bold text-[#6A48D6] underline">Nạp xương cá →</Link>
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-[14px] border border-[#F1EDF7]">
          {transactions.map((t, i) => {
            const credit = t.type !== 'spend' && t.type !== 'adjust' // adjust = admin trừ → chiều âm
            const dim = t.status !== 'success'
            const note = STATUS_NOTE[t.status]
            const sub = [t.type === 'topup' && t.provider ? PROVIDER_LABEL[t.provider] ?? t.provider : null, fmtDate(t.createdAt)]
              .filter(Boolean)
              .join(' · ')
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3.5 px-4 py-3.5 ${i < transactions.length - 1 ? 'border-b border-[#F4F0F9]' : ''} ${dim ? 'opacity-60' : ''}`}
              >
                <span
                  className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px]"
                  style={{ background: credit ? '#E7F7EE' : '#F0ECFF' }}
                >
                  {credit ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E9E63" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5" />
                      <path d="M6 11l6-6 6 6" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6A48D6" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="9" rx="2.5" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-[#2A2740]">
                    {TYPE_LABEL[t.type]}
                    {note && <span className="font-semibold text-[var(--text-subtle)]"> · {note}</span>}
                  </div>
                  <div className="mt-0.5 text-[12px] font-semibold text-[var(--text-subtle)]">{sub}</div>
                </div>
                <span className={`text-[14px] font-extrabold ${credit ? 'text-[var(--text-success)]' : 'text-[#D24A4A]'}`}>
                  {credit ? '+' : '−'}
                  {Math.abs(t.amountCoins)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
