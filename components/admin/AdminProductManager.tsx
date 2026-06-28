'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W13 — Admin Product/Bundle manager (M11/M04). Guard THẬT ở server (admin layout + /api/admin/* requireAdmin).
//   Client chỉ gọi API; KHÔNG import scoring/secret. Giá là dữ liệu admin nhập — SERVER là nguồn (price_coins authoritative).
//   Layout theo design frame 4 (bảng list). Logic/data flow GIỮ NGUYÊN, chỉ thay markup.
type ProductKind = 'single' | 'bundle'
type ProductListItem = {
  id: string
  slug: string | null
  title: string | null
  kind: string | null
  price_coins: number
  status: string
  sort_order: number
  test_count: number
}

const labelCls = 'block text-xs font-semibold text-[#6A6480]'
const inputCls =
  'mt-1 w-full rounded-[10px] border border-[#E4DEEE] bg-white p-2.5 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

function statusStyle(status: string) {
  if (status === 'published') return 'bg-[#E7F7EE] text-[#1E9E63]'
  if (status === 'draft') return 'bg-[#FFF1DC] text-[#C98A1A]'
  return 'bg-[#EFEBF2] text-[#8B8398]'
}

export function AdminProductManager() {
  const [items, setItems] = useState<ProductListItem[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<ProductKind>('bundle')
  const [priceCoins, setPriceCoins] = useState('0')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')

  const [phase, setPhase] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState('')

  async function load() {
    setLoadErr('')
    try {
      const r = await fetch('/api/admin/products')
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.items) setItems(j.data.items as ProductListItem[])
      else if (r.status === 403) setLoadErr('Bạn không có quyền admin.')
      else setLoadErr('Không tải được danh sách sản phẩm.')
    } catch {
      setLoadErr('Lỗi kết nối.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function submit() {
    setPhase('submitting')
    setError('')
    const price = Number(priceCoins)
    if (!Number.isInteger(price) || price < 0) {
      setError('Giá (coins) phải là số nguyên ≥ 0.')
      setPhase('idle')
      return
    }
    try {
      const r = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          kind,
          price_coins: price,
          description: description.trim() || undefined,
          sort_order: Number(sortOrder) || 0,
        }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 201 && j?.data?.product_id) {
        setTitle('')
        setSlug('')
        setDescription('')
        setPriceCoins('0')
        setSortOrder('0')
        setKind('bundle')
        setShowForm(false)
        await load()
      } else if (r.status === 403) {
        setError('Bạn không có quyền admin.')
      } else {
        setError((j?.message as string) || 'Không tạo được sản phẩm. Kiểm tra dữ liệu.')
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm font-semibold text-[#6A48D6] underline">
              ← Dashboard
            </Link>
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Sản phẩm / Bundle</h1>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-[#857F96]">Gồm cả draft &amp; hidden — khác catalog công khai</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-[11px] bg-[#7C5CE6] px-[18px] py-[11px] text-[14px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6]"
        >
          <span className="text-[16px] leading-none">{showForm ? '×' : '+'}</span> {showForm ? 'Đóng' : 'Tạo sản phẩm'}
        </button>
      </div>

      {/* Create form (toggle) */}
      {showForm && (
        <div className="mt-5 rounded-[15px] border border-[#ECE9F2] bg-[#FBFAFE] p-4">
          <h2 className="mb-2 text-[15px] font-extrabold">Tạo sản phẩm</h2>
          <label className={labelCls}>
            Tiêu đề
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: IELTS Reading Bundle 1" />
          </label>
          <label className={`${labelCls} mt-2`}>
            Slug
            <input className={`${inputCls} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ielts-reading-bundle-1" />
          </label>
          <p className="mt-1 text-[11px] text-[#A8A2BA]">Chữ thường, số và dấu gạch ngang (kebab-case).</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Loại
              <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as ProductKind)}>
                <option value="bundle">bundle</option>
                <option value="single">single</option>
              </select>
            </label>
            <label className={labelCls}>
              Giá (coins)
              <input className={inputCls} type="number" min={0} value={priceCoins} onChange={(e) => setPriceCoins(e.target.value)} />
            </label>
          </div>
          <label className={`${labelCls} mt-2`}>
            Mô tả (tuỳ chọn)
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn…" />
          </label>
          <label className={`${labelCls} mt-2`}>
            Thứ tự sắp xếp
            <input className={inputCls} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>

          {error && (
            <p aria-live="assertive" className="mt-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={phase === 'submitting' || !title.trim() || !slug.trim()}
            className="mt-3 w-full rounded-[11px] bg-[#7C5CE6] px-5 py-2.5 font-bold text-white transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
          >
            {phase === 'submitting' ? 'Đang lưu…' : 'Tạo sản phẩm (draft)'}
          </button>
        </div>
      )}

      {/* Notice */}
      <p className="mt-4 rounded-[10px] border border-[#E4DEEE] bg-[#FBFAFF] px-3 py-2 text-[12px] text-[#6A6480]">
        Giá (<code className="font-mono">price_coins</code>) là dữ liệu admin nhập — <b>server là nguồn quyết định</b> khi mua. Sản
        phẩm tạo ở trạng thái <b>draft</b>; chỉ <b>published</b> mới hiện ở catalog công khai.
      </p>

      {loadErr && <p className="mt-4 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>}

      {/* Table */}
      <div className="mt-5 overflow-x-auto rounded-[15px] border border-[#ECE9F2]">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[2.4fr_1fr_0.8fr_0.9fr_1fr_0.8fr] gap-3 bg-[#F7F5FB] px-[18px] py-3.5 text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#9088A2]">
            <span>Sản phẩm</span>
            <span>Loại</span>
            <span>Đề</span>
            <span>Giá</span>
            <span>Trạng thái</span>
            <span className="text-right">Thao tác</span>
          </div>

          {!items && !loadErr && <p className="px-[18px] py-6 text-center text-sm text-[#A8A2BA]">Đang tải…</p>}
          {items && items.length === 0 && (
            <p className="px-[18px] py-6 text-center text-sm text-[#A8A2BA]">Chưa có sản phẩm. Tạo sản phẩm đầu tiên.</p>
          )}

          {items?.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[2.4fr_1fr_0.8fr_0.9fr_1fr_0.8fr] items-center gap-3 border-t border-[#F0EDF5] bg-white px-[18px] py-3.5 transition hover:bg-[#FBFAFE]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] text-[16px] font-extrabold text-white/85"
                  style={{ background: 'linear-gradient(135deg,#D9CFFF,#B098FF)' }}
                >
                  {(p.title ?? '?').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-[#2A2740]">{p.title || '(chưa có tiêu đề)'}</div>
                  <div className="truncate font-mono text-[11.5px] font-semibold text-[#A8A2BA]">{p.slug}</div>
                </div>
              </div>
              <span className="justify-self-start rounded-[7px] bg-[#F0ECFF] px-2 py-1 text-[12px] font-bold capitalize text-[#5B43C7]">
                {p.kind ?? '—'}
              </span>
              <span className="text-[13.5px] font-bold text-[#564F6B]">{p.test_count}</span>
              <span className="text-[13.5px] font-extrabold text-[#2A2740]">
                {p.price_coins === 0 ? 'Free' : `🪙 ${p.price_coins}`}
              </span>
              <span className={`justify-self-start rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${statusStyle(p.status)}`}>
                {p.status}
              </span>
              <Link
                href={`/admin/products/${p.id}`}
                className="justify-self-end text-right text-[13px] font-bold text-[#6A48D6] hover:text-[#7C5CE6]"
              >
                Sửa →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
