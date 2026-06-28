'use client'

import { useState } from 'react'
import Link from 'next/link'

// W16 — Buy-now bằng coin (M08). Gọi POST /api/checkout { product_id } → trừ coin atomic ở server,
//   active ngay. KHÔNG activation code. Thành công → reload để refresh coin balance + trạng thái sở hữu.
export function BuyButtons({ productId, priceCoins }: { productId: string; priceCoins: number }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null)

  async function buy() {
    setErr(null)
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      })
      const body = await res.json().catch(() => null)
      const status = body?.data?.status
      if (res.ok && (status === 'paid' || status === 'already_owned')) {
        // active ngay → reload: product detail hiển thị "Đã sở hữu" + Header cập nhật coin.
        window.location.reload()
        return
      }
      const code = body?.meta?.error_code ?? 'INTERNAL'
      if (res.status === 401) setErr({ code: 'UNAUTHORIZED', msg: 'Bạn cần đăng nhập để mua.' })
      else if (code === 'INSUFFICIENT_COINS') setErr({ code, msg: 'Bạn không đủ coin để mua bộ đề này.' })
      else setErr({ code, msg: body?.message ?? 'Không mua được, vui lòng thử lại.' })
    } catch {
      setErr({ code: 'NETWORK', msg: 'Lỗi mạng, vui lòng thử lại.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={buy}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Đang xử lý…' : `Mua bằng coin · 🪙 ${priceCoins}`}
      </button>
      {err && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          {err.msg}
          {err.code === 'INSUFFICIENT_COINS' && (
            <Link href="/pricing" className="ml-1 font-medium text-teal-700 underline">
              Nạp coin →
            </Link>
          )}
          {err.code === 'UNAUTHORIZED' && (
            <Link href="/login" className="ml-1 font-medium text-teal-700 underline">
              Đăng nhập →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
