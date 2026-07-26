'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { FishBone } from '@/components/brand/FishBone'

// W13 — Admin Product/Bundle detail manager (M11/M04). Client gọi API; guard THẬT ở server.
//   Sửa meta/giá (PATCH), gắn đề + sắp xếp position (upsert), publish + refresh catalog (server).
//   KHÔNG nhận/hiển thị answer_keys/passages/questions/secret. Layout theo design frame 5; logic GIỮ NGUYÊN.
type ProductKind = 'single' | 'bundle'
type ProductMeta = {
  id: string
  slug: string | null
  title: string | null
  description: string | null
  thumbnail: string | null
  thumb_pos_x: number | null
  thumb_pos_y: number | null
  thumb_zoom: number | null
  kind: string | null
  price_coins: number
  status: string
  sort_order: number
}
type BoundTest = { position: number; test_id: string; slug: string | null; title: string | null; type: string | null; status: string | null }

const labelCls = 'block text-[12.5px] font-extrabold text-[#6A6480]'
const inputCls =
  'mt-1.5 w-full rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-3 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

function statusStyle(status: string) {
  if (status === 'published') return 'bg-[#E7F7EE] text-[var(--text-success)]'
  if (status === 'draft') return 'bg-[#FFF1DC] text-[#C98A1A]'
  return 'bg-[#EFEBF2] text-[#8B8398]'
}
function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${statusStyle(status)}`}>{status}</span>
}

export function AdminProductDetail({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductMeta | null>(null)
  const [tests, setTests] = useState<BoundTest[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [notFound, setNotFound] = useState(false)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<ProductKind>('bundle')
  const [priceCoins, setPriceCoins] = useState('0')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  // Ảnh minh họa bộ đề (products.thumbnail) + khung hiển thị (migration 20260726000200).
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [thumbPosX, setThumbPosX] = useState(50)
  const [thumbPosY, setThumbPosY] = useState(50)
  const [thumbZoom, setThumbZoom] = useState(100)
  const thumbInputRef = useRef<HTMLInputElement>(null)
  const thumbBoxRef = useRef<HTMLDivElement>(null)
  const thumbDragRef = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null)
  const thumbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [busy, setBusy] = useState('')
  const [editMsg, setEditMsg] = useState('')
  const [editErr, setEditErr] = useState('')

  const [bindTestId, setBindTestId] = useState('')
  const [bindPos, setBindPos] = useState('0')
  const [bindErr, setBindErr] = useState('')
  const [bindMsg, setBindMsg] = useState('')
  // Picker: danh sách đề (metadata) để chọn thay vì dán UUID tay (2026-07-12).
  const [pickList, setPickList] = useState<{ id: string; title: string | null; slug: string | null; type: string | null; status: string }[]>([])
  const [confirmUnbind, setConfirmUnbind] = useState<string | null>(null)

  function hydrate(p: ProductMeta) {
    setTitle(p.title ?? '')
    setSlug(p.slug ?? '')
    setKind((p.kind as ProductKind) ?? 'bundle')
    setPriceCoins(String(p.price_coins ?? 0))
    setDescription(p.description ?? '')
    setSortOrder(String(p.sort_order ?? 0))
    setThumbnail(p.thumbnail ?? null)
    // DB chưa áp migration 20260726000200 → undefined, rơi về canh giữa/vừa khung như cũ.
    setThumbPosX(Number(p.thumb_pos_x ?? 50))
    setThumbPosY(Number(p.thumb_pos_y ?? 50))
    setThumbZoom(Number(p.thumb_zoom ?? 100))
  }

  async function load() {
    setLoadErr('')
    setNotFound(false)
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
  useEffect(() => {
    load()
    // Nạp danh sách đề cho picker (metadata-only, tối đa 200 — đủ cho catalog hiện tại).
    ;(async () => {
      try {
        const r = await fetch('/api/admin/tests?per_page=200')
        const j = await r.json().catch(() => null)
        if (r.ok && Array.isArray(j?.data?.items)) setPickList(j.data.items)
      } catch {
        /* picker lỗi → vẫn còn ô dán UUID */
      }
    })()
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  // PATCH product là FULL BODY (updateProduct ghi đè cả row) → mọi lần lưu PHẢI gửi lại thumbnail
  //   và khung hiển thị. Trước đây saveMeta bỏ sót `thumbnail` nên bấm "Lưu thay đổi" là XOÁ ẢNH.
  function buildProductBody(over?: Record<string, unknown>) {
    return {
      id: productId,
      title: title.trim(),
      slug: slug.trim(),
      kind,
      price_coins: Number(priceCoins) || 0,
      description: description.trim() || undefined,
      sort_order: Number(sortOrder) || 0,
      thumbnail,
      thumb_pos_x: thumbPosX,
      thumb_pos_y: thumbPosY,
      thumb_zoom: thumbZoom,
      ...over,
    }
  }

  async function patchProduct(over: Record<string, unknown>): Promise<boolean> {
    const r = await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildProductBody(over)),
    })
    return r.ok
  }

  // Upload ảnh minh họa bộ đề: presign → PUT lên Supabase Storage → PATCH thumbnail.
  async function uploadThumb(file: File) {
    setBusy('thumb')
    setEditErr('')
    setEditMsg('')
    try {
      const r = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'image', filename: file.name, content_type: file.type, product_id: productId }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.data?.upload_url) {
        setEditErr(
          j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED'
            ? 'Supabase Storage chưa cấu hình (bucket media).'
            : 'Không tạo được upload URL cho ảnh.',
        )
        return
      }
      const { path, token, bucket, public_url } = j.data as { path: string; token: string; bucket: string; public_url: string }
      const { error: upErr } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file)
      if (upErr) {
        setEditErr(`Upload ảnh thất bại: ${upErr.message}`)
        return
      }
      if (!(await patchProduct({ thumbnail: public_url }))) {
        setEditErr('Đã upload nhưng không lưu được ảnh vào bộ đề.')
        return
      }
      setThumbnail(public_url)
      setEditMsg('✓ Đã cập nhật ảnh minh họa bộ đề.')
    } catch {
      setEditErr('Lỗi khi upload ảnh.')
    } finally {
      setBusy('')
      if (thumbInputRef.current) thumbInputRef.current.value = '' // cho phép chọn lại cùng file
    }
  }

  async function removeThumb() {
    setBusy('thumb')
    setEditErr('')
    setEditMsg('')
    try {
      if (!(await patchProduct({ thumbnail: null }))) {
        setEditErr('Không gỡ được ảnh.')
        return
      }
      setThumbnail(null)
      setEditMsg('✓ Đã gỡ ảnh minh họa bộ đề.')
    } catch {
      setEditErr('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  // Kéo/zoom bắn PATCH mỗi lần nhúc nhích sẽ spam API → gộp, gửi sau khi ngừng thao tác 500ms.
  //   Truyền giá trị TƯỜNG MINH để timer không bắt phải state cũ.
  function queueThumbDisplaySave(next: { x: number; y: number; z: number }) {
    if (thumbSaveTimer.current) clearTimeout(thumbSaveTimer.current)
    thumbSaveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const okRes = await patchProduct({
            thumb_pos_x: Math.round(next.x),
            thumb_pos_y: Math.round(next.y),
            thumb_zoom: Math.round(next.z),
          })
          if (okRes) setEditMsg('✓ Đã lưu khung ảnh.')
          else setEditErr('Không lưu được khung ảnh (đã áp migration chưa?).')
        } catch {
          setEditErr('Lỗi khi lưu khung ảnh.')
        }
      })()
    }, 500)
  }

  const clampPct = (n: number) => Math.min(100, Math.max(0, n))

  function onThumbPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!thumbnail) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    thumbDragRef.current = { cx: e.clientX, cy: e.clientY, px: thumbPosX, py: thumbPosY }
  }

  function onThumbPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = thumbDragRef.current
    const box = thumbBoxRef.current
    if (!d || !box) return
    const r = box.getBoundingClientRect()
    // Kéo ảnh XUỐNG = muốn thấy phần TRÊN → object-position GIẢM, nên trừ.
    const x = clampPct(d.px - ((e.clientX - d.cx) / r.width) * 100)
    const y = clampPct(d.py - ((e.clientY - d.cy) / r.height) * 100)
    setThumbPosX(x)
    setThumbPosY(y)
    queueThumbDisplaySave({ x, y, z: thumbZoom })
  }

  function endThumbDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!thumbDragRef.current) return
    thumbDragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function resetThumbDisplay() {
    setThumbPosX(50)
    setThumbPosY(50)
    setThumbZoom(100)
    queueThumbDisplaySave({ x: 50, y: 50, z: 100 })
  }

  async function saveMeta() {
    setBusy('save')
    setEditErr('')
    setEditMsg('')
    const price = Number(priceCoins)
    if (!Number.isInteger(price) || price < 0) {
      setEditErr('Giá (coins) phải là số nguyên ≥ 0.')
      setBusy('')
      return
    }
    try {
      const r = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildProductBody({ price_coins: price })),
      })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.product_id) {
        setEditMsg('✓ Đã lưu thay đổi.')
        await load()
      } else if (r.status === 403) setEditErr('Bạn không có quyền admin.')
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
    setBusy('bind')
    setBindErr('')
    setBindMsg('')
    const pos = Number(bindPos) || 0
    try {
      const res = await bindTest(bindTestId.trim(), pos)
      if (res.ok) {
        setBindTestId('')
        setBindPos('0')
        await load()
      } else if (res.status === 403) setBindErr('Bạn không có quyền admin.')
      else setBindErr(res.message || 'Không gắn được đề (kiểm tra test_id).')
    } catch {
      setBindErr('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  // Gỡ đề khỏi mục lục VOL. Owner quyết 2026-07-12: KHÔNG thu hồi quyền người đã mua trước đó.
  async function removeTest(testId: string) {
    setBusy('unbind')
    setBindErr('')
    setBindMsg('')
    setConfirmUnbind(null)
    try {
      const r = await fetch(`/api/admin/products/${productId}/tests`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test_id: testId }),
      })
      const j = await r.json().catch(() => null)
      if (r.ok) {
        setBindMsg('✓ Đã gỡ đề khỏi mục lục. Người đã mua VOL trước đó vẫn giữ quyền làm đề này.')
        await load()
      } else if (r.status === 403) setBindErr('Bạn không có quyền admin.')
      else setBindErr((j?.message as string) || 'Không gỡ được đề.')
    } catch {
      setBindErr('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  // ADMIN-010 — đổi thứ tự qua 1 endpoint ATOMIC (swap trong 1 transaction), KIỂM kết quả. Đường cũ gọi 2
  //   bind tuần tự + bỏ qua {ok} → fail giữa chừng để swap nửa vời/trùng position mà vẫn báo thành công.
  async function move(idx: number, dir: -1 | 1) {
    const ordered = [...tests].sort((a, b) => a.position - b.position || a.test_id.localeCompare(b.test_id))
    const j = idx + dir
    if (j < 0 || j >= ordered.length) return
    setBusy('reorder')
    setBindErr('')
    const a = ordered[idx],
      b = ordered[j]
    try {
      const r = await fetch(`/api/admin/products/${productId}/tests/reorder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test_id_a: a.test_id, test_id_b: b.test_id }),
      })
      const jb = await r.json().catch(() => null)
      if (!r.ok) setBindErr((jb?.message as string) || 'Không đổi được thứ tự.')
      await load() // luôn reload → UI phản ánh trạng thái server thật (thành công HAY thất bại)
    } catch {
      setBindErr('Lỗi kết nối khi đổi thứ tự.')
      await load()
    } finally {
      setBusy('')
    }
  }

  async function publish() {
    setBusy('publish')
    setEditErr('')
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

  const backLink = (
    <Link href="/admin/products" className="text-sm font-semibold text-[#6A48D6] underline">
      ← Danh sách sản phẩm
    </Link>
  )

  if (notFound) {
    return (
      <div>
        {backLink}
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">Không tìm thấy sản phẩm.</p>
      </div>
    )
  }
  if (loadErr) {
    return (
      <div>
        {backLink}
        <p className="mt-6 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>
      </div>
    )
  }
  if (!product) {
    return (
      <div>
        {backLink}
        <p className="mt-6 text-center text-sm text-[var(--text-subtle)]">Đang tải…</p>
      </div>
    )
  }

  const sorted = [...tests].sort((a, b) => a.position - b.position || a.test_id.localeCompare(b.test_id))

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="mb-1">{backLink}</div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">{product.title || '(chưa có tiêu đề)'}</h1>
        <StatusBadge status={product.status} />
        <span className="font-mono text-[12px] font-semibold text-[var(--text-subtle)]">{product.slug}</span>
      </div>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Left: fields + attached tests */}
        <div className="flex flex-col gap-[18px]">
          <label className={labelCls}>
            Tiêu đề
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3.5">
            <label className={labelCls}>
              Slug
              <input className={`${inputCls} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value)} />
            </label>
            <label className={labelCls}>
              Loại
              <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as ProductKind)}>
                <option value="bundle">bundle</option>
                <option value="single">single</option>
              </select>
            </label>
          </div>
          <label className={labelCls}>
            Mô tả
            <textarea className={`${inputCls} min-h-[72px]`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          {/* Ảnh minh họa bộ đề (products.thumbnail) — hiện ở khung cover trang /products/[slug] */}
          <div className="mt-4 rounded-[12px] border border-[#E8E2F2] bg-white p-3.5">
            <p className="text-[13px] font-bold text-[#2A2740]">Ảnh minh họa bộ đề</p>
            <p className="mt-0.5 text-[12px] font-medium text-[var(--text-muted)]">
              Hiện ở đầu trang bộ đề. PNG/JPG/WebP, ≤ 5MB. Không có ảnh → dùng nền gradient theo kỹ năng.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3.5">
              <div className="flex h-[68px] w-[120px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-[#EEEAF3] bg-[#FAF8FF]">
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnail}
                    alt="thumbnail"
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${thumbPosX}% ${thumbPosY}%`,
                      ...(thumbZoom !== 100 ? { transform: `scale(${thumbZoom / 100})` } : {}),
                    }}
                  />
                ) : (
                  <span className="text-[11px] font-semibold text-[#B4ADC4]">Chưa có ảnh</span>
                )}
              </div>
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadThumb(f)
                }}
              />
              <button
                type="button"
                onClick={() => thumbInputRef.current?.click()}
                disabled={busy === 'thumb'}
                className="rounded-[11px] bg-[#7C5CE6] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A48D6] disabled:bg-[#D8D2E4]"
              >
                {busy === 'thumb' ? 'Đang tải…' : thumbnail ? 'Đổi ảnh…' : 'Chọn ảnh…'}
              </button>
              {thumbnail && (
                <button
                  type="button"
                  onClick={removeThumb}
                  disabled={busy === 'thumb'}
                  className="rounded-[11px] border border-[#E4DEEE] bg-white px-4 py-2.5 text-sm font-bold text-[#564F6B] transition hover:border-[#CCC3DC] disabled:opacity-50"
                >
                  Gỡ ảnh
                </button>
              )}
            </div>

            {/* Khung căn ảnh — dựng ĐÚNG tỉ lệ 16/7 như cover trang bộ đề để thấy sao thì ra vậy. */}
            {thumbnail && (
              <div className="mt-3.5">
                <p className="text-[12px] font-bold text-[#2A2740]">Căn khung hiển thị</p>
                <p className="mt-0.5 text-[11.5px] font-medium text-[var(--text-muted)]">
                  Kéo ảnh để chọn phần lộ ra, dùng thanh trượt để phóng to. Tự lưu sau khi ngừng thao tác.
                </p>
                <div
                  ref={thumbBoxRef}
                  onPointerDown={onThumbPointerDown}
                  onPointerMove={onThumbPointerMove}
                  onPointerUp={endThumbDrag}
                  onPointerCancel={endThumbDrag}
                  role="group"
                  aria-label="Kéo để căn ảnh minh họa bộ đề"
                  className="relative mt-2 aspect-[16/7] w-full touch-none select-none overflow-hidden rounded-[18px] border border-[#EEEAF3] bg-[#FAF8FF] active:cursor-grabbing"
                  style={{ cursor: 'grab' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnail}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
                    style={{
                      objectPosition: `${thumbPosX}% ${thumbPosY}%`,
                      ...(thumbZoom !== 100 ? { transform: `scale(${thumbZoom / 100})` } : {}),
                    }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-[12px] font-bold text-[#564F6B]">
                    Phóng
                    <input
                      type="range"
                      min={100}
                      max={300}
                      step={5}
                      value={thumbZoom}
                      onChange={(e) => {
                        const z = Number(e.target.value)
                        setThumbZoom(z)
                        queueThumbDisplaySave({ x: thumbPosX, y: thumbPosY, z })
                      }}
                      aria-label="Mức phóng ảnh minh họa"
                      className="w-[170px] accent-[#7C5CE6]"
                    />
                    <span className="w-11 tabular-nums text-[var(--text-muted)]">{thumbZoom}%</span>
                  </label>
                  <button
                    type="button"
                    onClick={resetThumbDisplay}
                    className="rounded-[10px] border border-[#E4DEEE] bg-white px-3 py-1.5 text-[12px] font-bold text-[#564F6B] transition hover:border-[#CCC3DC]"
                  >
                    Về mặc định
                  </button>
                </div>
              </div>
            )}
          </div>
          <label className={`${labelCls} w-40`}>
            Thứ tự sắp xếp
            <input className={inputCls} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>

          {/* Attached tests */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12.5px] font-extrabold text-[#6A6480]">
                Đề trong sản phẩm <span className="font-semibold text-[var(--text-subtle)]">· dùng ↑/↓ để sắp xếp</span>
              </div>
            </div>

            {/* bind form — picker chọn đề (2026-07-12) + fallback dán UUID */}
            <div className="rounded-[11px] border border-[#ECE9F2] bg-[#FBFAFE] p-3">
              {pickList.length > 0 && (
                <label className={labelCls}>
                  Chọn đề để gắn
                  <select className={inputCls} value={bindTestId} onChange={(e) => setBindTestId(e.target.value)}>
                    <option value="">— Chọn đề —</option>
                    {pickList
                      .filter((t) => !tests.some((b) => b.test_id === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {(t.title || t.slug || t.id.slice(0, 8)) + ` · ${t.type ?? '—'} · ${t.status}`}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className={`${labelCls} mt-2 block`}>
                {pickList.length > 0 ? 'Hoặc dán test_id (UUID)' : 'Gắn đề (test_id)'}
                <input className={`${inputCls} font-mono`} value={bindTestId} onChange={(e) => setBindTestId(e.target.value)} placeholder="UUID của đề" />
              </label>
              <div className="mt-2 flex items-end gap-2">
                <label className={`${labelCls} w-24`}>
                  Vị trí
                  <input className={inputCls} type="number" min={0} value={bindPos} onChange={(e) => setBindPos(e.target.value)} />
                </label>
                <button
                  type="button"
                  onClick={addTest}
                  disabled={busy === 'bind' || !bindTestId.trim()}
                  className="rounded-[11px] bg-[#7C5CE6] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#6A48D6] disabled:bg-[#D8D2E4]"
                >
                  {busy === 'bind' ? 'Đang gắn…' : '+ Gắn đề'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-subtle)]">Đề draft trong bundle sẽ KHÔNG hiện công khai cho tới khi đề đó được publish.</p>
            </div>

            {bindErr && <p aria-live="assertive" className="mt-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{bindErr}</p>}
            {bindMsg && <p aria-live="polite" className="mt-3 rounded-[10px] border border-[#D9CFFF] bg-[#FBFAFF] px-3 py-2 text-[13px] font-semibold text-[#5B43C7]">{bindMsg}</p>}

            {sorted.length === 0 ? (
              <p className="mt-3 py-4 text-center text-sm text-[var(--text-subtle)]">Chưa có đề nào trong bundle.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {sorted.map((t, i) => (
                  <div key={t.test_id} className="flex items-center gap-3 rounded-[11px] border border-[#ECE9F2] bg-white px-3.5 py-3">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-[#F4F1FB] text-[12px] font-extrabold text-[var(--text-muted)]">
                      {t.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-[#2A2740]">{t.title || '(đề draft / ẩn)'}</span>
                        {t.status && <StatusBadge status={t.status} />}
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-subtle)]">
                        {t.type ?? '—'} · <span className="font-mono">{t.test_id.slice(0, 8)}…</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={busy === 'reorder' || i === 0}
                        aria-label="Lên"
                        className="rounded-[8px] border border-[#E4DEEE] px-2 py-1 text-xs hover:bg-[#F2EFF7] disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={busy === 'reorder' || i === sorted.length - 1}
                        aria-label="Xuống"
                        className="rounded-[8px] border border-[#E4DEEE] px-2 py-1 text-xs hover:bg-[#F2EFF7] disabled:opacity-40"
                      >
                        ↓
                      </button>
                      {confirmUnbind === t.test_id ? (
                        <span className="ml-1 flex items-center gap-1 text-[11.5px] font-bold">
                          Gỡ?
                          <button type="button" onClick={() => removeTest(t.test_id)} disabled={busy === 'unbind'} className="text-[#C0392B] underline">
                            Có
                          </button>
                          <button type="button" onClick={() => setConfirmUnbind(null)} className="underline">
                            Không
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmUnbind(t.test_id)}
                          disabled={busy === 'unbind'}
                          title="Gỡ đề khỏi mục lục VOL — người đã mua trước đó vẫn giữ quyền"
                          className="ml-1 rounded-[8px] border border-[#F3D2D2] bg-[#FDF6F6] px-2 py-1 text-xs font-bold text-[#C0392B] hover:bg-[#FBECEC] disabled:opacity-40"
                        >
                          Gỡ
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: pricing + publish */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-[16px] border border-[#ECE7F4] bg-white p-5">
            <div className="text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-[#6A6480]">Giá (xương cá)</div>
            <div className="mt-2.5 flex items-center gap-2.5 rounded-[11px] border border-[#E4DEEE] bg-[#FBFAFF] px-3.5 py-2.5">
              <span className="flex text-[18px]"><FishBone /></span>
              <input
                type="number"
                min={0}
                value={priceCoins}
                onChange={(e) => setPriceCoins(e.target.value)}
                className="w-full border-none bg-transparent font-mono text-[22px] font-extrabold text-[#2A2740] outline-none"
              />
            </div>
            <p className="mt-2.5 text-[11.5px] font-semibold leading-[1.45] text-[var(--text-subtle)]">
              Giá là server-authoritative. Đặt 0 để bộ đề miễn phí.
            </p>
          </div>

          <div className="rounded-[16px] border border-[#ECE7F4] bg-white p-5">
            <div className="mb-3 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-[#6A6480]">Xuất bản</div>
            <div className="flex items-center justify-between text-[13.5px] font-semibold text-[#564F6B]">
              Trạng thái <StatusBadge status={product.status} />
            </div>

            {editErr && <p aria-live="assertive" className="mt-3 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{editErr}</p>}
            {editMsg && <p className="mt-3 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{editMsg}</p>}

            <button
              type="button"
              onClick={publish}
              disabled={busy === 'publish' || product.status === 'published'}
              className="mt-3.5 w-full rounded-[11px] bg-[#7C5CE6] p-3.5 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:bg-[#D8D2E4]"
            >
              {product.status === 'published' ? 'Đã publish' : busy === 'publish' ? 'Đang publish…' : 'Publish ra catalog'}
            </button>
            <button
              type="button"
              onClick={saveMeta}
              disabled={busy === 'save'}
              className="mt-2.5 w-full rounded-[11px] bg-[#F4F1FB] p-3 text-[14px] font-bold text-[#2A2740] transition hover:bg-[#EAE4F6] disabled:opacity-60"
            >
              {busy === 'save' ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <p className="mt-2 text-[11px] text-[var(--text-subtle)]">Giá là dữ liệu admin nhập — server quyết định khi thanh toán. Publish làm mới catalog công khai.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
