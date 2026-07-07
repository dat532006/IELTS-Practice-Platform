'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Admin — Cấp quyền truy cập VOL trực tiếp cho 1 tài khoản (Hướng B).
//   Không cần key, không trừ xu: chọn email + VOL (hoặc "tất cả") → POST /api/admin/grants → RPC unlock + expand test_unlocks.
//   Guard THẬT ở server (admin layout + /api/admin/* requireAdmin). Client chỉ gọi API.
type ProductOption = { id: string; title: string | null; slug: string | null }
type GrantResult = { email: string | null; granted: number; requested: number }

const labelCls = 'block text-[12.5px] font-extrabold text-[#6A6480]'
const inputCls =
  'mt-1.5 w-full rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-3 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

export function AdminGrantAccess() {
  const [products, setProducts] = useState<ProductOption[] | null>(null)
  const [loadErr, setLoadErr] = useState('')

  const [email, setEmail] = useState('')
  const [productId, setProductId] = useState('all')

  const [phase, setPhase] = useState<'idle' | 'granting'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<GrantResult | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/products')
        const j = await r.json().catch(() => null)
        if (r.ok && j?.data?.items) setProducts(j.data.items as ProductOption[])
        else if (r.status === 403) setLoadErr('Bạn không có quyền admin.')
        else setLoadErr('Không tải được danh sách sản phẩm.')
      } catch {
        setLoadErr('Lỗi kết nối.')
      }
    })()
  }, [])

  async function grant() {
    setError('')
    setResult(null)
    if (!email.trim()) { setError('Nhập email tài khoản.'); return }
    if (!productId) { setError('Chọn VOL cần cấp.'); return }
    setPhase('granting')
    try {
      const r = await fetch('/api/admin/grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), product_id: productId }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data) {
        setResult(j.data as GrantResult)
      } else if (r.status === 403) {
        setError('Bạn không có quyền admin.')
      } else if (r.status === 404) {
        setError('Không tìm thấy tài khoản với email này.')
      } else {
        setError((j?.message as string) || 'Không cấp được quyền. Kiểm tra lại dữ liệu.')
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setPhase('idle')
    }
  }

  const productLabel = (p: ProductOption) => p.title || p.slug || p.id

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-sm font-semibold text-[#6A48D6] underline">← Dashboard</Link>
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Cấp quyền truy cập</h1>
      </div>

      <p className="mb-4 rounded-[11px] border border-[#D9CFFF] bg-[#F6F3FF] px-[15px] py-[11px] text-[13px] font-semibold leading-[1.5] text-[#5B43C7]">
        Cấp trực tiếp VOL cho 1 tài khoản — <b>không cần key, không trừ xu</b>. Tài khoản sẽ mở khóa ngay
        (mục Thư viện & vào làm bài). Cấp lại gói đã có sẽ được bỏ qua (an toàn).
      </p>

      {loadErr && <p className="mb-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>}

      <div className="max-w-lg rounded-[13px] border border-[#ECE9F2] bg-[#FBFAFE] p-4">
        <label className={labelCls}>Email tài khoản
          <input
            className={inputCls}
            type="email"
            placeholder="nguoidung@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className={`${labelCls} mt-2.5`}>VOL cần cấp
          <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!products}>
            <option value="all">Tất cả VOL (đã published)</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>{productLabel(p)}</option>
            ))}
          </select>
        </label>

        {error && <p aria-live="assertive" className="mt-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {result && (
          <p className="mt-3 rounded-[10px] border border-[#BFE9CF] bg-[#EAF9F0] px-3 py-2 text-sm font-bold text-[#1E7A48]">
            ✓ Đã cấp {result.granted}/{result.requested} gói cho {result.email}
            {result.granted === 0 && ' (tài khoản đã sở hữu sẵn các gói này)'}.
          </p>
        )}

        <button
          type="button"
          onClick={grant}
          disabled={phase === 'granting' || !email.trim()}
          className="mt-4 w-full rounded-[11px] bg-[#7C5CE6] px-5 py-3 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
        >
          {phase === 'granting' ? 'Đang cấp…' : 'Cấp quyền →'}
        </button>
      </div>
    </div>
  )
}
