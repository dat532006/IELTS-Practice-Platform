'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Admin danh sách đề (M11 mở rộng, 2026-07-12). Client gọi API; guard THẬT ở server.
//   Metadata-only (KHÔNG passages/questions/answer_keys). Hành động: sửa, toggle free, publish
//   lại đề hidden, xóa 2 tầng (server tự chọn: draft chưa ai làm → xóa hẳn; còn lại → ẩn).
type TestRow = {
  id: string
  slug: string | null
  title: string | null
  type: string | null
  is_free: boolean
  status: string
  duration_sec: number | null
  created_at: string
  products: { id: string; title: string | null; slug: string | null }[]
}

const inputCls =
  'rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

function statusStyle(status: string) {
  if (status === 'published') return 'bg-[#E7F7EE] text-[#1E9E63]'
  if (status === 'draft') return 'bg-[#FFF1DC] text-[#C98A1A]'
  return 'bg-[#EFEBF2] text-[#8B8398]'
}

const TYPE_CHIP: Record<string, { bg: string; color: string }> = {
  reading: { bg: '#F0ECFF', color: '#5B43C7' },
  listening: { bg: '#E4F3FF', color: '#1F6FB2' },
  writing: { bg: '#FFEDE6', color: '#C7542F' },
}

export function AdminTestList() {
  const [items, setItems] = useState<TestRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [busy, setBusy] = useState('') // test_id đang thao tác
  const [msg, setMsg] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  // UI-005: reqId + abort chống response cũ (đổi filter/trang nhanh) ghi đè kết quả mới hơn.
  const reqIdRef = useRef(0)
  const acRef = useRef<AbortController | null>(null)

  const load = useCallback(async (p: number, query: string, st: string, ty: string) => {
    const myId = ++reqIdRef.current
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac
    setLoadErr('')
    const sp = new URLSearchParams()
    if (query.trim()) sp.set('q', query.trim())
    if (st) sp.set('status', st)
    if (ty) sp.set('type', ty)
    sp.set('page', String(p))
    sp.set('per_page', String(50))
    try {
      const r = await fetch(`/api/admin/tests?${sp}`, { signal: ac.signal })
      const j = await r.json().catch(() => null)
      if (myId !== reqIdRef.current) return // load mới hơn đã chạy → bỏ kết quả cũ
      if (r.ok && j?.data) {
        setItems(j.data.items as TestRow[])
        setTotal(j.data.total as number)
        setPage(j.data.page as number)
      } else if (r.status === 403) setLoadErr('Bạn không có quyền admin.')
      else setLoadErr('Không tải được danh sách đề.')
    } catch {
      if (ac.signal.aborted || myId !== reqIdRef.current) return // bị load mới hủy → im lặng
      setLoadErr('Lỗi kết nối.')
    }
  }, [])

  useEffect(() => {
    load(1, '', '', '')
  }, [load])

  function refresh(p = page) {
    void load(p, q, status, type)
  }

  async function toggleFree(t: TestRow) {
    setBusy(t.id)
    setMsg('')
    try {
      const r = await fetch(`/api/admin/tests/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_free: !t.is_free }),
      })
      if (r.ok) setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, is_free: !t.is_free } : x)))
      else setMsg('Không đổi được trạng thái miễn phí.')
    } catch {
      setMsg('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  async function republish(t: TestRow) {
    setBusy(t.id)
    setMsg('')
    try {
      const r = await fetch(`/api/admin/tests/${t.id}/publish`, { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (r.ok) refresh()
      else setMsg((j?.message as string) || 'Không publish được đề.')
    } catch {
      setMsg('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  async function doDelete(t: TestRow) {
    setBusy(t.id)
    setMsg('')
    setConfirmDel(null)
    try {
      const r = await fetch(`/api/admin/tests/${t.id}`, { method: 'DELETE' })
      const j = await r.json().catch(() => null)
      if (r.ok && j?.data?.action) {
        setMsg(
          j.data.action === 'deleted'
            ? `✓ Đã xóa hẳn đề nháp "${t.title ?? t.id.slice(0, 8)}" (chưa ai làm).`
            : `✓ Đã ẩn đề "${t.title ?? t.id.slice(0, 8)}" khỏi catalog — học viên cũ vẫn xem được kết quả. Khôi phục bằng nút Publish lại.`,
        )
        refresh()
      } else setMsg((j?.message as string) || 'Không xóa được đề.')
    } catch {
      setMsg('Lỗi kết nối.')
    } finally {
      setBusy('')
    }
  }

  const pages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">Đề thi ({total})</h1>
          <p className="mt-1 text-[13.5px] font-semibold text-[#857F96]">
            Danh sách metadata — đáp án không bao giờ tải về trang này.
          </p>
        </div>
        <Link
          href="/admin/tests/new"
          className="rounded-[11px] bg-[#7C5CE6] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A48D6]"
        >
          + Tạo đề mới
        </Link>
      </div>

      {/* filters */}
      <form
        className="mt-4 flex flex-wrap items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          refresh(1)
        }}
      >
        <input
          className={`${inputCls} w-64`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tiêu đề / slug…"
        />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Mọi kỹ năng</option>
          <option value="reading">Reading</option>
          <option value="listening">Listening</option>
          <option value="writing">Writing</option>
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          <option value="published">published</option>
          <option value="draft">draft</option>
          <option value="hidden">hidden</option>
        </select>
        <button type="submit" className="rounded-[11px] bg-[#F4F1FB] px-4 py-2.5 text-sm font-bold text-[#2A2740] hover:bg-[#EAE4F6]">
          Lọc
        </button>
      </form>

      {loadErr && <p role="alert" className="mt-4 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</p>}
      {msg && <p aria-live="polite" className="mt-4 rounded-[10px] border border-[#D9CFFF] bg-[#FBFAFF] px-3 py-2 text-[13px] font-semibold text-[#5B43C7]">{msg}</p>}

      {/* rows */}
      <div className="mt-4 flex flex-col gap-2">
        {items.length === 0 && !loadErr && (
          <p className="py-6 text-center text-sm text-[#A8A2BA]">Không có đề nào khớp bộ lọc.</p>
        )}
        {items.map((t) => {
          const chip = TYPE_CHIP[t.type ?? ''] ?? { bg: '#EFEBF2', color: '#8B8398' }
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#ECE9F2] bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/tests/${t.id}`} className="truncate text-[14.5px] font-bold text-[#2A2740] hover:text-[#6A48D6] hover:underline">
                    {t.title || '(chưa có tiêu đề)'}
                  </Link>
                  <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-extrabold" style={{ background: chip.bg, color: chip.color }}>
                    {t.type ?? '—'}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${statusStyle(t.status)}`}>{t.status}</span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-[#A8A2BA]">
                  <span className="font-mono">{t.slug ?? t.id.slice(0, 8)}</span>
                  {t.products.length > 0 && (
                    <> · trong: {t.products.map((p) => p.title ?? p.slug ?? p.id.slice(0, 8)).join(', ')}</>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleFree(t)}
                disabled={busy === t.id}
                title="Đổi miễn phí ↔ tính phí (đề tính phí cần mua VOL mới làm được)"
                className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold transition disabled:opacity-50 ${
                  t.is_free ? 'bg-[#E7F7EE] text-[#1E9E63] hover:bg-[#D4F0E1]' : 'bg-[#FFF3DC] text-[#A87614] hover:bg-[#FBE9C4]'
                }`}
              >
                {t.is_free ? 'Miễn phí' : 'Tính phí'}
              </button>

              <div className="flex items-center gap-1.5">
                <Link
                  href={`/admin/tests/${t.id}`}
                  className="rounded-[9px] border border-[#E4DEEE] px-3 py-1.5 text-[12.5px] font-bold text-[#2A2740] hover:bg-[#F2EFF7]"
                >
                  Sửa
                </Link>
                {t.status !== 'published' && (
                  <button
                    type="button"
                    onClick={() => republish(t)}
                    disabled={busy === t.id}
                    className="rounded-[9px] border border-[#CBEED9] bg-[#F2FBF6] px-3 py-1.5 text-[12.5px] font-bold text-[#1E7A48] hover:bg-[#E4F6EC] disabled:opacity-50"
                  >
                    {t.status === 'hidden' ? 'Hiện lại' : 'Publish'}
                  </button>
                )}
                {confirmDel === t.id ? (
                  <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
                    Chắc chắn?
                    <button type="button" onClick={() => doDelete(t)} disabled={busy === t.id} className="text-[#D24A4A] underline">
                      Xóa
                    </button>
                    <button type="button" onClick={() => setConfirmDel(null)} className="underline">
                      Hủy
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDel(t.id)}
                    disabled={busy === t.id}
                    title="Đề nháp chưa ai làm sẽ xóa hẳn; đề đã publish/đã có người làm sẽ chuyển sang ẩn"
                    className="rounded-[9px] border border-[#F3D2D2] bg-[#FDF6F6] px-3 py-1.5 text-[12.5px] font-bold text-[#C0392B] hover:bg-[#FBECEC] disabled:opacity-50"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm font-bold">
          <button type="button" disabled={page <= 1} onClick={() => refresh(page - 1)} className="rounded-[9px] border border-[#E4DEEE] px-3 py-1.5 disabled:opacity-40">
            ← Trước
          </button>
          <span className="text-[#857F96]">
            Trang {page}/{pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => refresh(page + 1)} className="rounded-[9px] border border-[#E4DEEE] px-3 py-1.5 disabled:opacity-40">
            Sau →
          </button>
        </div>
      )}
    </div>
  )
}
