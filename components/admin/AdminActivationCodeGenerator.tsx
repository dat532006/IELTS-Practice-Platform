'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W14 — Admin Activation Code generator (M11). Guard THẬT ở server (admin layout + /api/admin/* requireAdmin).
//   Client chỉ gọi API; KHÔNG import crypto/secret. Plaintext hiển thị MỘT LẦN (BE không trả lại) →
//   reload/rời trang là mất; CSV build client-side từ codes đã nhận (KHÔNG gọi lại API). KHÔNG chạm pepper/code_hash.
//   (FE-F02: port từ branch w14/frontend-activation-codes — chưa từng merge; restyle theo admin violet W16.)
type ProductOption = { id: string; title: string | null; slug: string | null }
type GeneratedCode = { code: string; code_prefix: string; code_last4: string; expires_at: string | null }
type GenResult = { product_id: string; generated: number; codes: GeneratedCode[] }

const labelCls = 'block text-[12.5px] font-extrabold text-[#6A6480]'
const inputCls =
  'mt-1.5 w-full rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-3 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

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
        // KHÔNG nêu tên env secret trong string client (giữ bất biến bundle-audit "0 token").
        setError('Server chưa cấu hình khoá sinh mã — liên hệ Owner/DevOps để đặt biến môi trường.')
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
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-sm font-semibold text-[#6A48D6] underline">← Dashboard</Link>
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Mã kích hoạt</h1>
      </div>

      <p className="mb-4 rounded-[11px] border border-[#F6E4C4] bg-[#FFF6E9] px-[15px] py-[11px] text-[13px] font-semibold leading-[1.5] text-[#A66A12]">
        Mã đầy đủ chỉ hiển thị <b>một lần</b> ngay sau khi sinh (hệ thống chỉ lưu bản băm). <b>Lưu hoặc tải CSV ngay</b> —
        rời/khởi động lại trang sẽ KHÔNG xem lại được.
      </p>

      {loadErr && <p className="rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>}

      {!result ? (
        <div className="max-w-lg rounded-[13px] border border-[#ECE9F2] bg-[#FBFAFE] p-4">
          <h2 className="mb-2 text-[14px] font-extrabold text-[#2A2740]">Sinh mã</h2>

          <label className={labelCls}>Sản phẩm
            {products && products.length === 0 ? (
              <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
                Chưa có sản phẩm — <Link href="/admin/products" className="text-[#6A48D6] underline">tạo sản phẩm</Link> trước.
              </p>
            ) : (
              <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!products}>
                {!products && <option>Đang tải…</option>}
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title || p.slug || p.id}</option>
                ))}
              </select>
            )}
          </label>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <label className={labelCls}>Số lượng
              <input className={inputCls} type="number" min={1} max={1000} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            <label className={labelCls}>Số lần dùng / mã
              <input className={inputCls} type="number" min={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} />
            </label>
          </div>
          <label className={`${labelCls} mt-2.5`}>Hết hạn (tuỳ chọn)
            <input className={inputCls} type="datetime-local" value={expiresLocal} onChange={(e) => setExpiresLocal(e.target.value)} />
          </label>

          {error && <p aria-live="assertive" className="mt-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <button
            type="button"
            onClick={generate}
            disabled={phase === 'generating' || !productId}
            className="mt-4 w-full rounded-[11px] bg-[#7C5CE6] px-5 py-3 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
          >
            {phase === 'generating' ? 'Đang sinh…' : 'Sinh mã →'}
          </button>
        </div>
      ) : (
        <div className="rounded-[13px] border border-[#D9CFFF] bg-[#FBFAFF] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <p className="font-semibold text-[#5B43C7]">✓ Đã sinh {result.generated} mã</p>
            <button type="button" onClick={downloadCsv} className="rounded-[9px] bg-[#2A2740] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#17152A]">
              ⬇ Tải CSV
            </button>
            <button type="button" onClick={reset} className="rounded-[9px] border border-[#E4DEEE] bg-white px-3.5 py-2 text-[13px] font-bold text-[#564F6B] hover:border-[#CCC3DC]">
              Sinh mẻ mới
            </button>
          </div>
          <p className="mb-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-[12.5px] font-bold text-rose-700">
            ⚠️ Đây là lần DUY NHẤT thấy mã đầy đủ. Tải CSV / sao chép ngay. Rời trang = mất.
          </p>
          <div className="max-h-80 overflow-auto rounded-[10px] border border-[#ECE9F2] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FBFAFF] text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Mã</th><th className="px-3 py-2">Hết hạn</th></tr>
              </thead>
              <tbody>
                {result.codes.map((c, i) => (
                  <tr key={c.code} className="border-t border-[#F1EEF7]">
                    <td className="px-3 py-2 text-[var(--text-subtle)]">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-bold">{c.code}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{c.expires_at ? c.expires_at.slice(0, 10) : '—'}</td>
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
