'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// W16 — Buy-now bằng coin (M08). Đọc số dư coin của user (RLS own-row) để hiện đủ/thiếu coin;
//   đủ → POST /api/checkout { product_id } (server trừ coin atomic, active ngay) → reload.
//   Thiếu → CTA "Nạp thêm coin →" /pricing. price_coins server-authoritative (chỉ hiển thị ở đây).
export function BuyButtons({ productId, priceCoins }: { productId: string; priceCoins: number }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [buying, setBuying] = useState(false)
  const [err, setErr] = useState<{ code: string; msg: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active) return
        if (!data.user) {
          setAuthed(false)
          return
        }
        setAuthed(true)
        const { data: profile } = await supabase.from('profiles').select('coins').eq('id', data.user.id).single()
        if (active) setBalance(profile?.coins ?? 0)
      })
      .catch(() => {
        if (active) setAuthed(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function buy() {
    setErr(null)
    setBuying(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      })
      const body = await res.json().catch(() => null)
      const status = body?.data?.status
      if (res.ok && (status === 'paid' || status === 'already_owned')) {
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
      setBuying(false)
    }
  }

  const enough = balance != null && balance >= priceCoins
  const need = Math.max(0, priceCoins - (balance ?? 0))

  // Chưa đăng nhập → CTA đăng nhập
  if (authed === false) {
    return (
      <Link
        href="/login"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#7C5CE6] p-[15px] text-[15.5px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(124,92,230,0.5)] transition hover:bg-[#6A48D6]"
      >
        Đăng nhập để mua →
      </Link>
    )
  }

  return (
    <>
      {/* Số dư */}
      <div className="mt-4 flex items-center justify-between rounded-[12px] border border-[#EEEAF6] bg-[#FBFAFF] px-3.5 py-[11px]">
        <span className="text-[13px] font-semibold text-[#857F96]">Số dư của bạn</span>
        <span className={`text-[14.5px] font-extrabold ${enough ? 'text-[#1E9E63]' : 'text-[#C98A1A]'}`}>
          🪙 {balance == null ? '…' : balance.toLocaleString('vi-VN')}
        </span>
      </div>

      {balance != null && !enough ? (
        <>
          <div className="mt-4 flex items-center gap-2.5 rounded-[13px] border border-[#F6E4C4] bg-[#FFF6E9] px-[15px] py-[13px]">
            <span className="h-[7px] w-[7px] flex-none rounded-full bg-[#E59A1B]" />
            <span className="text-[13px] font-semibold leading-[1.4] text-[#A66A12]">
              Thiếu <b>🪙{need.toLocaleString('vi-VN')}</b> để mua bộ đề này.
            </span>
          </div>
          <Link
            href="/pricing"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#2A2740] p-[15px] text-[15.5px] font-bold text-white transition hover:bg-[#17152A]"
          >
            Nạp thêm coin →
          </Link>
          <div className="mt-[11px] text-center text-[12.5px] font-semibold text-[#A8A2BA]">
            Sau khi nạp, quay lại đây để mua ngay
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={buy}
            disabled={buying || balance == null}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#7C5CE6] p-[15px] text-[15.5px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(124,92,230,0.5)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {buying ? 'Đang xử lý…' : (
              <>
                Mua bằng coin <span className="font-extrabold opacity-85">· 🪙 {priceCoins}</span>
              </>
            )}
          </button>
          <div className="mt-[11px] text-center text-[12.5px] font-semibold text-[#A8A2BA]">
            Trừ 🪙{priceCoins} — sở hữu vĩnh viễn, làm lại không giới hạn
          </div>
        </>
      )}

      {err && (
        <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          {err.msg}
          {err.code === 'INSUFFICIENT_COINS' && (
            <Link href="/pricing" className="ml-1 font-medium text-[#6A48D6] underline">
              Nạp coin →
            </Link>
          )}
          {err.code === 'UNAUTHORIZED' && (
            <Link href="/login" className="ml-1 font-medium text-[#6A48D6] underline">
              Đăng nhập →
            </Link>
          )}
        </div>
      )}
    </>
  )
}
