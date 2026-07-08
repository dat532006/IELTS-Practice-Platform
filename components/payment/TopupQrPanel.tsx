'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FishBone } from '@/components/brand/FishBone'

// A1-alt — panel VietQR nạp xương cá qua chuyển khoản (SePay). Client CHỈ hiển thị + poll trạng thái
//   (GET /api/payment/status, owner-guard); credit hoàn toàn do webhook server verify — UI không
//   bao giờ tự kết luận thành công từ phía client.
type Props = {
  refCode: string
  amountVnd: number
  amountCoins: number
  initialStatus: string
  expiresAt: string | null
  qrUrl: string
  bank: { account: string; bank: string; name: string | null }
}

const vnd = (n: number) => n.toLocaleString('vi-VN')

export function TopupQrPanel({ refCode, amountVnd, amountCoins, initialStatus, expiresAt, qrUrl, bank }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState<string | null>(null)

  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null
  const expired = status === 'expired' || (status === 'pending' && expiresMs != null && now > expiresMs)

  // Poll trạng thái mỗi 4s khi còn pending (webhook có thể đến muộn hơn expire → vẫn poll nhẹ khi expired).
  useEffect(() => {
    if (status === 'success') return
    const t = setInterval(async () => {
      setNow(Date.now())
      try {
        const r = await fetch(`/api/payment/status?ref=${refCode}`)
        const b = await r.json().catch(() => null)
        const s = b?.data?.status
        if (typeof s === 'string' && s !== status) setStatus(s)
      } catch {
        /* mạng chập chờn — thử lại vòng sau */
      }
    }, 4000)
    return () => clearInterval(t)
  }, [refCode, status])

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(tag)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      /* clipboard bị chặn — user tự chọn/copy */
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-[20px] border border-[#BFE9CF] bg-[#F2FBF6] px-8 py-12 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DCF3E6] text-[26px]">✓</span>
        <h2 className="mt-4 text-[22px] font-extrabold text-[#166B41]">Đã nhận thanh toán!</h2>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#1E7A48]">
          +<FishBone /> {amountCoins} xương cá đã vào tài khoản của bạn.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/products" className="rounded-[12px] bg-[#7C5CE6] px-5 py-2.5 text-[14px] font-bold text-white hover:bg-[#6A48D6]">
            Mua bộ đề →
          </Link>
          <Link href="/account" className="rounded-[12px] border border-[#CBE7D6] bg-white px-5 py-2.5 text-[14px] font-bold text-[#166B41]">
            Xem ví
          </Link>
        </div>
      </div>
    )
  }

  const secondsLeft = expiresMs != null ? Math.max(0, Math.floor((expiresMs - now) / 1000)) : null
  const mm = secondsLeft != null ? String(Math.floor(secondsLeft / 60)).padStart(2, '0') : null
  const ss = secondsLeft != null ? String(secondsLeft % 60).padStart(2, '0') : null

  return (
    <div className="rounded-[20px] border border-[#EEEAF3] bg-white p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#2A2740]">Chuyển khoản VietQR</h2>
        {!expired && mm != null && (
          <span className="text-[13px] font-bold text-[#857F96]">
            Hết hạn sau <span className="font-mono text-[#C7542F]">{mm}:{ss}</span>
          </span>
        )}
      </div>

      {expired && (
        <div className="mt-4 rounded-[12px] border border-[#F6E4C4] bg-[#FFF6E9] px-4 py-3 text-[13.5px] font-semibold text-[#A66A12]">
          Phiên nạp đã hết hạn. Nếu bạn <b>đã chuyển tiền</b>, hệ thống vẫn cộng xương cá ngay khi nhận được
          thông báo từ ngân hàng — chờ thêm chút hoặc liên hệ hỗ trợ kèm mã giao dịch. Chưa chuyển →{' '}
          <Link href="/pricing" className="text-[#6A48D6] underline">tạo phiên mới</Link>.
        </div>
      )}

      <div className="mt-5 grid gap-6 sm:grid-cols-[220px_1fr]">
        <div className="mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="VietQR chuyển khoản" width={220} height={220} className="rounded-[14px] border border-[#EEEAF3]" />
          <p className="mt-2 text-center text-[12px] font-semibold text-[#9D96AE]">Quét bằng app ngân hàng bất kỳ</p>
        </div>

        <div className="space-y-3 text-[14px]">
          {[
            { label: 'Ngân hàng', value: bank.bank, tag: null },
            { label: 'Số tài khoản', value: bank.account, tag: 'acc' },
            ...(bank.name ? [{ label: 'Chủ tài khoản', value: bank.name, tag: null }] : []),
            { label: 'Số tiền', value: `${vnd(amountVnd)} ₫`, tag: 'amt', raw: String(amountVnd) },
            { label: 'Nội dung CK', value: refCode, tag: 'ref' },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-[11px] border border-[#F0EDF6] bg-[#FBFAFF] px-3.5 py-2.5">
              <span className="font-semibold text-[#857F96]">{row.label}</span>
              <span className="flex items-center gap-2 font-extrabold text-[#2A2740]">
                <span className={row.tag === 'ref' ? 'font-mono text-[13px]' : ''}>{row.value}</span>
                {row.tag && (
                  <button
                    type="button"
                    onClick={() => copy('raw' in row && row.raw ? row.raw : row.value, row.tag as string)}
                    className="rounded-[7px] border border-[#E4DEEE] bg-white px-2 py-0.5 text-[11px] font-bold text-[#6A48D6] hover:border-[#CCC3DC]"
                  >
                    {copied === row.tag ? '✓' : 'Copy'}
                  </button>
                )}
              </span>
            </div>
          ))}

          <div className="rounded-[11px] border border-[#F6E4C4] bg-[#FFF6E9] px-3.5 py-2.5 text-[12.5px] font-semibold leading-[1.55] text-[#A66A12]">
            ⚠️ Chuyển <b>đúng số tiền</b> và <b>giữ nguyên nội dung</b> <span className="font-mono">{refCode}</span> —
            hệ thống khớp tự động theo nội dung này. Sai nội dung/số tiền sẽ phải đối soát tay.
          </div>

          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#857F96]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#7C5CE6]" />
            Đang chờ thanh toán — trang tự cập nhật khi server xác nhận (thường vài giây sau khi chuyển).
          </div>
        </div>
      </div>
    </div>
  )
}
