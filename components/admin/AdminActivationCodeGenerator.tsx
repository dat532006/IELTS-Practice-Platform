'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W14 — Admin Activation Code generator (M11). Guard THẬT ở server (admin layout + /api/admin/* requireAdmin).
//   Client chỉ gọi API; KHÔNG import crypto/secret. Plaintext hiển thị MỘT LẦN (BE không trả lại) →
//   reload/rời trang là mất; CSV build client-side từ codes đã nhận (KHÔNG gọi lại API). KHÔNG chạm pepper/code_hash.
type ProductOption = { id: string; title: string | null; slug: string | null }
type GeneratedCode = { code: string; code_prefix: string; code_last4: string; expires_at: string | null }
type GenResult = { product_id: string; generated: number; codes: GeneratedCode[] }

const labelCls = 'block text-xs font-semibold text-slate-600'
const inputCls = 'mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

export function AdminActivationCodeGenerator() {
  const [products, setProducts] = useState<ProductOption[] | null>(null)
  const [loadErr, setLoadErr] = useState('')

  const [productId, setProductId] = useState('')
  const [count, setCount] = useState('10')
  const [maxRedemptions, setMaxRedemptions] = useState('1')
  const [expiresLocal, setExpiresLocal] = useState('')

  const [phase, setPhase] = useState<'idle' | 'generating'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<GenResult | null>(null) // plaintext CHỈ ở memory, 1 lần

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/products')
        const j = await r.json().catch(() => null)
        if (r.ok && j?.data?.items) {
          const items = j.data.items as ProductOption[]
          setProducts(items)
          if (items[0]) setProductId(items[0].id)
        } else if (r.status === 403) setLoadErr('Bạn không có quyền admin.')
        else setLoadErr('Không tải được danh sách sản phẩm.')
      } catch {
        setLoadErr('Lỗi kết nối.')
      }
    })()
  }, [])

  async function generate() {
    setPhase('generating')
    setError('')
    const n = Number(count)
    const mx = Number(maxRedemptions)
    if (!productId) { setError('Chọn sản phẩm.'); setPhase('idle'); return }
    if (!Number.isInteger(n) || n < 1 || n > 1000) { setError('Số lượng phải là số nguyên 1..1000.'); setPhase('idle'); return }
    if (!Number.isInteger(mx) || mx < 1) { setError('Số lần dùng tối đa phải là số nguyên ≥ 1.'); setPhase('idle'); return }
    let expires_at: string | undefined
    if (expiresLocal) {
      const d = new Date(expiresLocal)
      if (Number.isNaN(d.getTime())) { setError('Ngày hết hạn không hợp lệ.'); setPhase('idle'); return }
      expires_at = d.toISOString()
    }
    try {
      const r = await fetch('/api/admin/activation-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: productId, count: n, max_redemptions: mx, expires_at }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 201 && j?.data?.codes) {
        setResult(j.data as GenResult)
      } else if (r.status === 403) {
        setError('Bạn không có quyền admin.')
      } else if (j?.meta?.error_code === 'ACTIVATION_NOT_CONFIGURED') {
        setError('Server chưa cấu hình khoá sinh mã (ACTIVATION_CODE_PEPPER) — cần Owner/DevOps.')
      } else {
        setError((j?.message as string) || 'Không sinh được mã. Kiểm tra dữ liệu.')
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setPhase('idle')
    }
  }

  // CSV build CLIENT-SIDE từ codes đã nhận (KHÔNG gọi lại API → tránh sinh mẻ mới). Khớp format BE.
  function downloadCsv() {
    if (!result) return
    const header = 'code,product_id,expires_at'
    const lines = result.codes.map((c) => `${c.code},${result.product_id},${c.expires_at ?? ''}`)
    const csv = [header, ...lines].join('\r\n') + '\r\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activation-codes-${result.product_id}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function reset() {
    setResult(null) // xoá plaintext khỏi state → không xem lại được
    setError('')
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-sm text-teal-700 underline">← Dashboard</Link>
        <h1 className="text-xl font-bold text-slate-800">Mã kích hoạt</h1>
      </div>

      <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Mã đầy đủ chỉ hiển thị <b>một lần</b> ngay sau khi sinh (hệ thống chỉ lưu bản băm). <b>Lưu hoặc tải CSV ngay</b> —
        rời/khởi động lại trang sẽ KHÔNG xem lại được.
      </p>

      {loadErr && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</p>}

      {!result ? (
        <div className="max-w-lg rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-800">Sinh mã</h2>

          <label className={labelCls}>Sản phẩm
            {products && products.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Chưa có sản phẩm — <Link href="/admin/products" className="text-teal-700 underline">tạo sản phẩm</Link> trước.</p>
            ) : (
              <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!products}>
                {!products && <option>Đang tải…</option>}
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title || p.slug || p.id}</option>
                ))}
              </select>
            )}
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={labelCls}>Số lượng
              <input className={inputCls} type="number" min={1} max={1000} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            <label className={labelCls}>Số lần dùng / mã
              <input className={inputCls} type="number" min={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} />
            </label>
          </div>
          <label className={`${labelCls} mt-2`}>Hết hạn (tuỳ chọn)
            <input className={inputCls} type="datetime-local" value={expiresLocal} onChange={(e) => setExpiresLocal(e.target.value)} />
          </label>

          {error && <p aria-live="assertive" className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button type="button" onClick={generate} disabled={phase === 'generating' || !productId}
            className="mt-3 w-full rounded-md bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {phase === 'generating' ? 'Đang sinh…' : 'Sinh mã'}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-teal-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="font-semibold text-teal-800">✓ Đã sinh {result.generated} mã</p>
            <button type="button" onClick={downloadCsv} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">⬇ Tải CSV</button>
            <button type="button" onClick={reset} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Sinh mẻ mới</button>
          </div>
          <p className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            ⚠️ Đây là lần DUY NHẤT thấy mã đầy đủ. Tải CSV / sao chép ngay. Rời trang = mất.
          </p>
          <div className="max-h-80 overflow-auto rounded border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Mã</th><th className="px-2 py-1.5">Hết hạn</th></tr>
              </thead>
              <tbody>
                {result.codes.map((c, i) => (
                  <tr key={c.code} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-2 py-1.5 font-mono">{c.code}</td>
                    <td className="px-2 py-1.5 text-slate-500">{c.expires_at ? c.expires_at.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
