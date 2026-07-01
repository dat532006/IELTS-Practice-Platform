'use client'

import Link from 'next/link'

// W19 (M10) — error boundary toàn site (route segment gốc). Client component bắt buộc.
// Không lộ chi tiết lỗi/stack cho người dùng; chỉ thông báo + retry. (global-error.tsx bắt lỗi ở layout gốc.)
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-16 text-center text-[#2A2740]">
      <div className="text-[56px] leading-none">⚠️</div>
      <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em]">Đã có lỗi xảy ra</h1>
      <p className="mt-2.5 max-w-[30em] text-[15px] leading-[1.6] text-[#5C5670]">
        Rất tiếc, trang gặp sự cố khi tải. Vui lòng thử lại; nếu vẫn lỗi, hãy quay lại sau ít phút.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-[13px] bg-[#7C5CE6] px-5 py-3 text-[15px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(124,92,230,0.5)] transition hover:bg-[#6A48D6]"
        >
          Thử lại
        </button>
        <Link
          href="/"
          className="rounded-[13px] border border-[#E4DEEE] bg-white px-5 py-3 text-[15px] font-bold text-[#564F6B] transition hover:border-[#CCC3DC]"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  )
}
