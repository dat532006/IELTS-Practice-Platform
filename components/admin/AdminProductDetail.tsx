'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// W13 — Admin Product/Bundle detail manager (M11/M04). Client gọi API; guard THẬT ở server.
//   Sửa meta/giá (PATCH), gắn đề + sắp xếp position (upsert), publish + refresh catalog (server).
//   KHÔNG nhận/hiển thị answer_keys/passages/questions/secret (API trả test metadata-only).
type ProductKind = 'single' | 'bundle'
type ProductMeta = {
  id: string
  slug: string | null
  title: string | null
  description: string | null
  thumbnail: string | null
  kind: string | null
  price_coins: number
  status: string
  sort_order: number
}
type BoundTest = { position: number; test_id: string; slug: string | null; title: string | null; type: string | null; status: string | null }

const labelCls = 'block text-xs font-semibold text-slate-600'
const inputCls = 'mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500'

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'published' ? 'bg-emerald-100 text-emerald-700' : status === 'hidden' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{status}</span>
}

export function AdminProductDetail({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductMeta | null>(null)
  const [tests, setTests] = useState<BoundTest[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [notFound, setNotFound] = useState(false)

  // edit form
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<ProductKind>('bundle')
  const [priceCoins, setPriceCoins] = useState('0')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')

  const [busy, setBusy] = useState('')
  const [editMsg, setEditMsg] = useState('')
  const [editErr, setEditErr] = useState('')

  // bind
  const [bindTestId, setBindTestId] = useState('')
  const [bindPos, setBindPos] = useState('0')
  const [bindErr, setBindErr] = useState('')

  function hydrate(p: ProductMeta) {
    setTitle(p.title ?? '')
    setSlug(p.slug ?? '')
    setKind((p.kind as ProductKind) ?? 'bundle')
    setPriceCoins(String(p.price_coins ?? 0))
    setDescription(p.description ?? '')
    setSortOrder(String(p.sort_order ?? 0))
  }

  async function load() {
    setLoadErr(''); setNotFound(false)
    try {
      const r = await fetch(`/api/admin/products/${productId}`)
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.product) {
        setProduct(j.data.product as ProductMeta)
        setTests((j.data.tests ?? []) as BoundTest[])
        hydrate(j.data.product as ProductMeta)
      } else if (r.status === 404) {
        setNotFound(true)
      } else if (r.status === 403) {
        setLoadErr('Bạn không có quyền admin.')
      } else {
        setLoadErr('Không tải được sản phẩm.')
      }
    } catch {
      setLoadErr('Lỗi kết nối.')
    }
  }
  useEffect(() => { load() }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveMeta() {
    setBusy('save'); setEditErr(''); setEditMsg('')
    const price = Number(priceCoins)
    if (!Number.isInteger(price) || price < 0) {
      setEditErr('Giá (coins) phải là số nguyên ≥ 0.'); setBusy(''); return
    }
    try {
      const r = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: productId,
          title: title.trim(),
          slug: slug.trim(),
          kind,
          price_coins: price,
          description: description.trim() || undefined,
          sort_order: Number(sortOrder) || 0,
        }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.product_id) { setEditMsg('✓ Đã lưu thay đổi.'); await load() }
      else if (r.status === 403) setEditErr('Bạn không có quyền admin.')
      else setEditErr((j?.message as string) || 'Không lưu được thay đổi.')
    } catch {
      setEditErr('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  async function bindTest(testId: string, position: number) {
    const r = await fetch(`/api/admin/products/${productId}/tests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ test_id: testId, position }),
    })
    const j = await r.json().catch(() => null)
    return { ok: r.ok, status: r.status, message: j?.message as string | undefined }
  }

  async function addTest() {
    setBusy('bind'); setBindErr('')
    const pos = Number(bindPos) || 0
    try {
      const res = await bindTest(bindTestId.trim(), pos)
      if (res.ok) { setBindTestId(''); setBindPos('0'); await load() }
      else if (res.status === 403) setBindErr('Bạn không có quyền admin.')
      else setBindErr(res.message || 'Không gắn được đề (kiểm tra test_id).')
    } catch {
      setBindErr('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  // Đổi thứ tự: hoán đổi position với phần tử kề (persist 2 upsert) rồi reload.
  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= tests.length) return
    setBusy('reorder'); setBindErr('')
    const a = tests[idx], b = tests[j]
    try {
      await bindTest(a.test_id, b.position)
      await bindTest(b.test_id, a.position)
      await load()
    } catch {
      setBindErr('Không đổi được thứ tự.')
    } finally {
      setBusy('')
    }
  }

  async function publish() {
    setBusy('publish'); setEditErr('')
    try {
      const r = await fetch(`/api/admin/products/${productId}/publish`, { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data) await load()
      else if (r.status === 403) setEditErr('Bạn không có quyền admin.')
      else setEditErr('Không publish được sản phẩm.')
    } finally {
      setBusy('')
    }
  }

  if (notFound) {
    return (
      <div>
        <Link href="/admin/products" className="text-sm text-teal-700 underline">← Danh sách sản phẩm</Link>
        <p className="mt-6 text-center text-sm text-slate-500">Không tìm thấy sản phẩm.</p>
      </div>
    )
  }
  if (loadErr) {
    return (
      <div>
        <Link href="/admin/products" className="text-sm text-teal-700 underline">← Danh sách sản phẩm</Link>
        <p className="mt-6 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</p>
      </div>
    )
  }
  if (!product) {
    return (
      <div>
        <Link href="/admin/products" className="text-sm text-teal-700 underline">← Danh sách sản phẩm</Link>
        <p className="mt-6 text-center text-sm text-slate-400">Đang tải…</p>
      </div>
    )
  }

  const sorted = [...tests].sort((a, b) => a.position - b.position || a.test_id.localeCompare(b.test_id))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/admin/products" className="text-sm text-teal-700 underline">← Danh sách sản phẩm</Link>
        <h1 className="text-xl font-bold text-slate-800">{product.title || '(chưa có tiêu đề)'}</h1>
        <StatusBadge status={product.status} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Edit meta */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-800">Thông tin & giá</h2>
          <label className={labelCls}>Tiêu đề
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className={`${labelCls} mt-2`}>Slug
            <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
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
          <label className={`${labelCls} mt-2`}>Mô tả
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className={`${labelCls} mt-2`}>Thứ tự sắp xếp
            <input className={inputCls} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>

          {editErr && <p aria-live="assertive" className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{editErr}</p>}
          {editMsg && <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{editMsg}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={saveMeta} disabled={busy === 'save'} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300">
              {busy === 'save' ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <button type="button" onClick={publish} disabled={busy === 'publish' || product.status === 'published'} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400">
              {product.status === 'published' ? 'Đã publish' : busy === 'publish' ? 'Đang publish…' : 'Publish'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Giá là dữ liệu admin nhập — server quyết định khi thanh toán. Publish sẽ làm mới catalog công khai.</p>
        </section>

        {/* Bind tests */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-800">Đề trong bundle ({sorted.length})</h2>

          <div className="rounded border border-slate-100 p-2">
            <label className={labelCls}>Gắn đề (test_id)
              <input className={inputCls} value={bindTestId} onChange={(e) => setBindTestId(e.target.value)} placeholder="UUID của đề (tạo ở mục Tạo đề)" />
            </label>
            <div className="mt-2 flex items-end gap-2">
              <label className={`${labelCls} w-28`}>Vị trí
                <input className={inputCls} type="number" min={0} value={bindPos} onChange={(e) => setBindPos(e.target.value)} />
              </label>
              <button type="button" onClick={addTest} disabled={busy === 'bind' || !bindTestId.trim()} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300">
                {busy === 'bind' ? 'Đang gắn…' : 'Gắn đề'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Đề draft trong bundle sẽ KHÔNG hiện công khai cho tới khi đề đó được publish.</p>
          </div>

          {bindErr && <p aria-live="assertive" className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{bindErr}</p>}

          {sorted.length === 0 ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">Chưa có đề nào trong bundle.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {sorted.map((t, i) => (
                <li key={t.test_id} className="flex items-center gap-2 py-2">
                  <span className="w-6 text-center text-xs font-semibold text-slate-500">{t.position}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{t.title || '(đề draft / ẩn)'}</span>
                      {t.status && <StatusBadge status={t.status} />}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">{t.type ?? '—'} · <span className="font-mono">{t.test_id.slice(0, 8)}…</span></div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={busy === 'reorder' || i === 0} aria-label="Lên" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={busy === 'reorder' || i === sorted.length - 1} aria-label="Xuống" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40">↓</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
