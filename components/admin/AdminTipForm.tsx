'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { RichTextEditor } from '@/components/admin/RichTextEditor'
import { createClient } from '@/lib/supabase/client'
import { sanitizeTipHtmlClient } from '@/lib/sanitize/passage-html-client'
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
  const [body, setBody] = useState(initial?.body_html ?? '')

  const [phase, setPhase] = useState<'idle' | 'saving'>('idle')
  const [error, setError] = useState('')
  const [imgMsg, setImgMsg] = useState('')

  function onTitle(v: string) {
    setTitle(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  // Upload 1 ảnh qua /api/admin/media (bucket 'media' public) → trả public_url để chèn vào bài.
  //   Cùng pipeline ảnh minh hoạ đề (AdminTestForm). Thiếu Storage → báo, không crash.
  async function uploadImage(file: File): Promise<string | null> {
    setImgMsg('Đang tải ảnh…')
    try {
      const r = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'image', filename: file.name }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.data?.upload_url) {
        setImgMsg(
          j?.meta?.error_code === 'STORAGE_NOT_CONFIGURED'
            ? '⚠️ Supabase Storage (bucket media) chưa cấu hình — chưa chèn được ảnh.'
            : 'Không tạo được URL tải ảnh.',
        )
        return null
      }
      const { path, token, bucket, public_url } = j.data as {
        path: string
        token: string
        bucket: string
        public_url: string
      }
      const { error: upErr } = await createClient().storage.from(bucket).uploadToSignedUrl(path, token, file)
      if (upErr) {
        setImgMsg(`Tải ảnh thất bại: ${upErr.message}`)
        return null
      }
      setImgMsg('✓ Đã chèn ảnh vào bài.')
      return public_url
    } catch {
      setImgMsg('Lỗi kết nối khi tải ảnh.')
      return null
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
      </div>

      <div className="mt-5">
        <span className={labelCls}>Nội dung bài viết</span>
        <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
          Chèn ảnh bằng nút <b>🖼 Ảnh</b> hoặc dán ảnh trực tiếp (Ctrl+V) vào bài — như soạn Word.
        </p>
        <div className="mt-1.5">
          <RichTextEditor
            value={body}
            onChange={setBody}
            ariaLabel="Nội dung bài Tips"
            placeholder="Soạn nội dung bài viết…"
            sanitize={sanitizeTipHtmlClient}
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

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={phase === 'saving'}
          className="rounded-[11px] bg-[#7C5CE6] px-5 py-3 text-[14.5px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(124,92,230,0.45)] transition hover:bg-[#6A48D6] disabled:cursor-not-allowed disabled:bg-[#D8D2E4]"
        >
          {phase === 'saving' ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo bài viết'}
        </button>
        <Link href="/admin/tips" className="text-sm font-semibold text-[var(--text-muted)] underline">
          Huỷ
        </Link>
      </div>
    </div>
  )
}
