'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W13 — Admin Product/Bundle manager (M11/M04). Guard THẬT ở server (admin layout + /api/admin/* requireAdmin).
//   Client chỉ gọi API; KHÔNG import scoring/secret. Giá là dữ liệu admin nhập — SERVER là nguồn (price_coins authoritative).
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

const labelCls = 'block text-xs font-semibold text-slate-600'
const inputCls = 'mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'published' ? 'bg-emerald-100 text-emerald-700' : status === 'hidden' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{status}</span>
}

export function AdminProductManager() {
  const [items, setItems] = useState<ProductListItem[] | null>(null)
  const [loadErr, setLoadErr] = useState('')

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
  useEffect(() => { load() }, [])

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
        setTitle(''); setSlug(''); setDescription(''); setPriceCoins('0'); setSortOrder('0'); setKind('bundle')
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
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-sm text-teal-700 underline">← Dashboard</Link>
        <h1 className="text-xl font-bold text-slate-800">Sản phẩm / Bundle</h1>
      </div>

      <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        Giá (<code>price_coins</code>) là dữ liệu admin nhập — <b>server là nguồn quyết định</b> khi mua. Sản phẩm tạo ở trạng thái
        <b> draft</b>; chỉ <b>published</b> mới hiện ở catalog công khai.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Create form */}
        <section className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold text-slate-800">Tạo sản phẩm</h2>
            <label className={labelCls}>Tiêu đề
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: IELTS Reading Bundle 1" />
            </label>
            <label className={`${labelCls} mt-2`}>Slug
              <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ielts-reading-bundle-1" />
            </label>
            <p className="mt-1 text-[11px] text-slate-400">Chữ thường, số và dấu gạch ngang (kebab-case).</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className={labelCls}>Loại
                <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as ProductKind)}>
                  <option value="bundle">bundle</option>
                  <option value="single">single</option>
                </select>
              </label>
              <label className={labelCls}>Giá (coins)
                <input className={inputCls} type="number" min={0} value={priceCoins} onChange={(e) => setPriceCoins(e.target.value)} />
              </label>
            </div>
            <label className={`${labelCls} mt-2`}>Mô tả (tuỳ chọn)
              <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn…" />
            </label>
            <label className={`${labelCls} mt-2`}>Thứ tự sắp xếp
              <input className={inputCls} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </label>

            {error && <p aria-live="assertive" className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button type="button" onClick={submit} disabled={phase === 'submitting' || !title.trim() || !slug.trim()}
              className="mt-3 w-full rounded-md bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {phase === 'submitting' ? 'Đang lưu…' : 'Tạo sản phẩm (draft)'}
            </button>
          </div>
        </section>

        {/* List */}
        <section className="lg:col-span-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Danh sách ({items?.length ?? 0})</h2>
              <button type="button" onClick={load} className="text-xs text-teal-700 underline">↻ Tải lại</button>
            </div>

            {loadErr && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</p>}

            {!items && !loadErr && <p className="py-6 text-center text-sm text-slate-400">Đang tải…</p>}

            {items && items.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">Chưa có sản phẩm. Tạo sản phẩm đầu tiên ở bên trái.</p>
            )}

            {items && items.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {items.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-800">{p.title || '(chưa có tiêu đề)'}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        <span className="font-mono">{p.slug}</span> · {p.kind} · {p.price_coins} coins · {p.test_count} đề
                      </div>
                    </div>
                    <Link href={`/admin/products/${p.id}`} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
                      Quản lý →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
