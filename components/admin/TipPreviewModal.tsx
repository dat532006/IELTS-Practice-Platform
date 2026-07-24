'use client'

import { useEffect } from 'react'
import { TIP_SKILL, TIP_TYPE_LABEL, type TipSkill, type TipType } from '@/lib/tips/articles'

// Xem trước bài Tips ĐÚNG như trang công khai /tips/[slug] — dùng ngay trong form admin, xem được cả bản nháp
//   (không cần Đăng). Thân bài render trực tiếp HTML từ TipTap (nội dung của chính admin, schema TipTap không
//   sinh script/on*-handler). Bản đăng thật vẫn qua server sanitizeTipHtml (chốt bảo mật) — preview chỉ hiển thị.
type Props = {
  open: boolean
  onClose: () => void
  title: string
  skill: TipSkill
  type: TipType
  author: string
  band: string
  readMinutes: number
  coverImage: string
  coverFit: 'cover' | 'contain'
  coverHeight: number
  body: string
}

function initialsOf(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '•'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

export function TipPreviewModal({ open, onClose, title, skill, type, author, band, readMinutes, coverImage, coverFit, coverHeight, body }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const sk = TIP_SKILL[skill]
  const read = `${readMinutes || 5} phút đọc`
  const hasBody = body.replace(/<[^>]*>/g, '').trim().length > 0 || /<(img|table|hr)/i.test(body)

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-center overflow-y-auto bg-black/50 p-3 sm:p-5"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Xem trước bài viết"
    >
      <div
        className="relative my-6 h-fit w-full max-w-[840px] rounded-[20px] bg-white shadow-[0_40px_90px_-30px_rgba(30,20,60,0.6)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Thanh trên */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[20px] border-b border-[#EEE7F3] bg-white/95 px-5 py-3 backdrop-blur">
          <span className="text-[13px] font-extrabold text-[#6A48D6]">Xem trước · giao diện trang /tips</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9px] border border-[#E4DEEE] bg-white px-3 py-1.5 text-[13px] font-bold text-[#3D3654] transition hover:border-[#CCC3DC]"
          >
            ✕ Đóng
          </button>
        </div>

        {/* Thân — mô phỏng app/(marketing)/tips/[slug]/page.tsx */}
        <div className="px-5 pb-14 pt-7 text-[#2A2740] sm:px-8">
          <div className="mx-auto max-w-[760px]">
            <span
              className="inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.06em]"
              style={{ color: sk.text }}
            >
              <span aria-hidden="true" className="inline-block h-[9px] w-[9px] rotate-45 rounded-[3px]" style={{ background: sk.color }} />
              {sk.label} · {TIP_TYPE_LABEL[type]}
            </span>
            <h1 className="mt-4 text-[clamp(27px,4.5vw,38px)] font-extrabold leading-[1.12] tracking-[-0.03em]">
              {title.trim() || 'Tiêu đề bài viết'}
            </h1>
            <div className="mt-[22px] flex items-center gap-3.5">
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-[#F0ECFF] text-[15px] font-extrabold text-[#6A48D6]">
                {initialsOf(author || 'IELTS Practice')}
              </span>
              <div>
                <div className="text-[14.5px] font-extrabold">
                  {author.trim() || 'IELTS Practice'}
                  {band.trim() && ` · ${band.trim()}`}
                </div>
                <div className="text-[12.5px] font-semibold text-[var(--text-subtle)]">{read}</div>
              </div>
            </div>

            {coverImage ? (
              <div className="mt-[26px] overflow-hidden rounded-[22px] bg-[#F1EEF9]" style={{ height: coverHeight }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="" aria-hidden="true" className="h-full w-full" style={{ objectFit: coverFit }} />
              </div>
            ) : (
              <div aria-hidden="true" className="mt-[26px] aspect-[16/8] rounded-[22px]" style={{ backgroundImage: sk.cover }} />
            )}

            {hasBody ? (
              <article className="tip-prose mt-[30px]" dangerouslySetInnerHTML={{ __html: body }} />
            ) : (
              <p className="mt-[30px] text-[15px] text-[var(--text-subtle)]">Nội dung bài viết đang được cập nhật.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
