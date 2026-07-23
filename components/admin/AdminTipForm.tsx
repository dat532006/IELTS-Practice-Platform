'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { TipRichEditor } from '@/components/admin/TipRichEditor'
import { TipPreviewModal } from '@/components/admin/TipPreviewModal'
import { createClient } from '@/lib/supabase/client'
import { slugify, type TipSkill, type TipType } from '@/lib/tips/articles'

// Form soạn/sửa bài Tips. Guard THẬT ở server (admin layout + /api/admin/tips requireAdmin); client chỉ gọi API.
export type TipFormInitial = {
  id: string
  slug: string
  skill: TipSkill
  type: TipType
  title: string
  excerpt: string
  body_html: string
  author: string
  band: string
  read_minutes: number
  status: 'draft' | 'published'
  sort_order: number
  featured: boolean
  cover_image: string
}

const labelCls = 'block text-[12.5px] font-extrabold text-[#6A6480]'
const inputCls =
  'mt-1.5 w-full rounded-[11px] border border-[#E4DEEE] bg-white px-3.5 py-2.5 text-sm text-[#2A2740] focus:border-[#7C5CE6] focus:outline-none'

const SKILLS: { v: TipSkill; l: string }[] = [
  { v: 'reading', l: 'Reading' },
  { v: 'listening', l: 'Listening' },
  { v: 'writing', l: 'Writing' },
  { v: 'speaking', l: 'Speaking' },
]
const TYPES: { v: TipType; l: string }[] = [
  { v: 'strategy', l: 'Chiến thuật' },
  { v: 'qtype', l: 'Dạng bài' },
]

export function AdminTipForm({ initial }: { initial?: TipFormInitial }) {
  const router = useRouter()
  const editing = !!initial

  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(editing)
  const [skill, setSkill] = useState<TipSkill>(initial?.skill ?? 'reading')
  const [type, setType] = useState<TipType>(initial?.type ?? 'strategy')
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [band, setBand] = useState(initial?.band ?? '')
  const [readMinutes, setReadMinutes] = useState(String(initial?.read_minutes ?? 5))
  const [status, setStatus] = useState<'draft' | 'published'>(initial?.status ?? 'draft')
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0))
  const [featured, setFeatured] = useState(initial?.featured ?? false)
  const [coverImage, setCoverImage] = useState(initial?.cover_image ?? '')
  const [coverPreview, setCoverPreview] = useState('') // objectURL local hiện NGAY trước khi upload xong
  const [coverBusy, setCoverBusy] = useState(false)
  const [body, setBody] = useState(initial?.body_html ?? '')

  const [phase, setPhase] = useState<'idle' | 'saving'>('idle')
  const [error, setError] = useState('')
  const [imgMsg, setImgMsg] = useState('')
  const [coverMsg, setCoverMsg] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const coverRef = useRef<HTMLInputElement>(null)

  function onTitle(v: string) {
    setTitle(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  // Upload lõi qua /api/admin/media (bucket 'media' public) → trả public_url. Cùng pipeline ảnh minh hoạ đề
  //   (AdminTestForm). Thiếu Storage → throw thông điệp cụ thể để nơi gọi hiển thị.
  async function uploadToMedia(file: File): Promise<string> {
    const r = await fetch('/api/admin/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'image', filename: file.name }),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.data?.upload_url) {
      throw new Error(
        j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED'
          ? '⚠️ Supabase Storage (bucket media) chưa cấu hình.'
          : 'Không tạo được URL tải ảnh.',
      )
    }
    const { path, token, bucket, public_url } = j.data as { path: string; token: string; bucket: string; public_url: string }
    const { error: upErr } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file)
    if (upErr) throw new Error(`Tải ảnh thất bại: ${upErr.message}`)
    return public_url
  }

  // Chèn ảnh INLINE trong bài (RichTextEditor gọi). Báo trạng thái qua imgMsg.
  async function uploadImage(file: File): Promise<string | null> {
    setImgMsg('Đang tải ảnh…')
    try {
      const url = await uploadToMedia(file)
      setImgMsg('✓ Đã chèn ảnh vào bài.')
      return url
    } catch (e) {
      setImgMsg(e instanceof Error ? e.message : 'Lỗi kết nối khi tải ảnh.')
      return null
    }
  }

  // Ảnh bìa: chọn tệp → PREVIEW cục bộ ngay (trước khi upload) → upload nền → lưu URL thật vào state.
  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setCoverMsg('Vui lòng chọn tệp ảnh.')
    const localUrl = URL.createObjectURL(file) // xem trước ngay lập tức, không chờ mạng
    setCoverPreview(localUrl)
    setCoverBusy(true)
    setCoverMsg('Đang tải ảnh bìa…')
    try {
      const url = await uploadToMedia(file)
      setCoverImage(url)
      setCoverMsg('✓ Đã cập nhật ảnh bìa.')
    } catch (err) {
      setCoverMsg(err instanceof Error ? err.message : 'Lỗi khi tải ảnh bìa.')
    } finally {
      URL.revokeObjectURL(localUrl)
      setCoverPreview('')
      setCoverBusy(false)
    }
  }

  async function save() {
    setError('')
    if (!title.trim()) return setError('Nhập tiêu đề.')
    if (!slug.trim()) return setError('Nhập slug.')
    setPhase('saving')
    const payload = {
      slug: slug.trim(),
      skill,
      type,
      title: title.trim(),
      excerpt: excerpt.trim(),
      body_html: body,
      author: author.trim(),
      band: band.trim(),
      read_minutes: Number(readMinutes) || 5,
      status,
      sort_order: Number(sortOrder) || 0,
      featured,
      cover_image: coverImage,
    }
    try {
      const r = await fetch(editing ? `/api/admin/tips/${initial!.id}` : '/api/admin/tips', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => null)
      if (r.ok) {
        router.push('/admin/tips')
        router.refresh()
      } else if (r.status === 403) {
        setError('Bạn không có quyền admin.')
      } else {
        setError((j?.message as string) || 'Không lưu được bài viết.')
      }
    } catch {
      setError('Lỗi kết nối.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="rounded-[20px] border border-[#E7E4EE] bg-white p-6 text-[#2A2740] shadow-[0_30px_60px_-38px_rgba(60,40,90,0.4)] sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/admin/tips" className="text-sm font-semibold text-[#6A48D6] underline">
          ← Danh sách Tips
        </Link>
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em]">{editing ? 'Sửa bài Tips' : 'Bài Tips mới'}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={`${labelCls} md:col-span-2`}>
          Tiêu đề
          <input className={inputCls} value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Ví dụ: 7 bước xử lý dạng True/False/Not Given" />
        </label>

        <label className={labelCls}>
          Slug (đường dẫn /tips/…)
          <input
            className={inputCls}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            placeholder="vd-tfng"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className={labelCls}>
            Kỹ năng
            <select className={inputCls} value={skill} onChange={(e) => setSkill(e.target.value as TipSkill)}>
              {SKILLS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Dạng
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as TipType)}>
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={`${labelCls} md:col-span-2`}>
          Tóm tắt (excerpt — hiện ở thẻ & đầu bài)
          <textarea className={`${inputCls} min-h-[70px]`} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} maxLength={500} />
        </label>

        <label className={labelCls}>
          Tác giả
          <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Minh Trang" />
        </label>
        <label className={labelCls}>
          Band (nhãn tác giả)
          <input className={inputCls} value={band} onChange={(e) => setBand(e.target.value)} placeholder="IELTS 8.5" />
        </label>

        <label className={labelCls}>
          Số phút đọc
          <input className={inputCls} type="number" min={1} max={120} value={readMinutes} onChange={(e) => setReadMinutes(e.target.value)} />
        </label>
        <label className={labelCls}>
          Thứ tự (nhỏ hiện trước)
          <input className={inputCls} type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>

        <label className={labelCls}>
          Trạng thái
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}>
            <option value="draft">Nháp (chưa hiện)</option>
            <option value="published">Đã đăng (public)</option>
          </select>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#E4DEEE] bg-[#FBFAFF] p-3.5 md:col-span-2">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] flex-none cursor-pointer accent-[#7C5CE6]"
          />
          <span>
            <span className="block text-[13px] font-extrabold text-[#2A2740]">★ Đặt làm Bài nổi bật</span>
            <span className="mt-0.5 block text-[12px] font-semibold text-[var(--text-subtle)]">
              Hiện ở ô lớn đầu trang /tips. Chỉ 1 bài nổi bật — chọn bài này sẽ tự bỏ nổi bật ở bài khác. (Bài phải ở trạng thái “Đã đăng”.)
            </span>
          </span>
        </label>

        <div className="md:col-span-2">
          <span className={labelCls}>Ảnh bìa (minh hoạ)</span>
          <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
            Hiện ở thẻ bài và ô nổi bật. Bỏ trống → dùng nền gradient theo kỹ năng.
          </p>
          <input ref={coverRef} type="file" accept="image/*" hidden onChange={onPickCover} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="relative flex h-[68px] w-[120px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-[#E4DEEE] bg-[#FBFAFF]">
              {coverPreview || coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview || coverImage} alt="Xem trước ảnh bìa" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold text-[var(--text-subtle)]">Chưa có ảnh</span>
              )}
              {coverBusy && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-bold text-white">
                  Đang tải…
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={coverBusy}
              onClick={() => coverRef.current?.click()}
              className="rounded-[10px] border border-[#E4DEEE] bg-white px-3.5 py-2 text-[13px] font-bold text-[#3D3654] transition hover:border-[#CCC3DC] disabled:opacity-50"
            >
              {coverImage ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'}
            </button>
            {(coverImage || coverPreview) && (
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => {
                  setCoverImage('')
                  setCoverPreview('')
                  setCoverMsg('Đã gỡ ảnh bìa (sẽ dùng gradient).')
                }}
                className="rounded-[10px] border border-rose-200 bg-white px-3.5 py-2 text-[13px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                Gỡ
              </button>
            )}
          </div>
          {coverMsg && <p className="mt-1.5 text-[12.5px] font-semibold text-[#5B43C7]">{coverMsg}</p>}
        </div>
      </div>

      <div className="mt-5">
        <span className={labelCls}>Nội dung bài viết</span>
        <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
          Soạn như Word: định dạng, <b>bảng</b>, <b>liên kết</b>, chèn ảnh (nút <b>🖼 Ảnh</b> hoặc dán/kéo-thả ảnh),
          chỉnh cỡ ảnh, hoàn tác (Ctrl+Z).
        </p>
        <div className="mt-1.5">
          <TipRichEditor
            value={body}
            onChange={setBody}
            ariaLabel="Nội dung bài Tips"
            placeholder="Soạn nội dung bài viết…"
            onImageUpload={uploadImage}
          />
        </div>
        {imgMsg && <p className="mt-1.5 text-[12.5px] font-semibold text-[#5B43C7]">{imgMsg}</p>}
      </div>

      {error && (
        <p aria-live="assertive" className="mt-4 rounded-[10px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={phase === 'saving' || coverBusy}
          className="rounded-[11px] bg-[#7C5CE6] px-5 py-3 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
        >
          {phase === 'saving' ? 'Đang lưu…' : coverBusy ? 'Đang tải ảnh…' : editing ? 'Lưu thay đổi' : 'Tạo bài viết'}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="rounded-[11px] border border-[#E4DEEE] bg-white px-5 py-3 text-[14px] font-bold text-[#3D3654] transition hover:border-[#CCC3DC]"
        >
          👁 Xem trước
        </button>
        <Link href="/admin/tips" className="text-sm font-semibold text-[var(--text-muted)] underline">
          Huỷ
        </Link>
      </div>

      <TipPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        skill={skill}
        type={type}
        author={author}
        band={band}
        readMinutes={Number(readMinutes) || 5}
        coverImage={coverPreview || coverImage}
        body={body}
      />
    </div>
  )
}
