import Link from 'next/link'
import type { Metadata } from 'next'

// W19 (M10) — 404 toàn site. Server component; render trong root layout (không Header/Footer) nên tự có nav về.
export const metadata: Metadata = { title: 'Không tìm thấy trang', robots: { index: false } }

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-16 text-center text-[#2A2740]">
      <div className="text-[64px] font-extrabold leading-none tracking-[-0.03em] text-[#7C5CE6]">404</div>
      <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em]">Không tìm thấy trang</h1>
      <p className="mt-2.5 max-w-[30em] text-[15px] leading-[1.6] text-[#5C5670]">
        Trang bạn tìm không tồn tại hoặc đã được di chuyển. Kiểm tra lại đường dẫn hoặc quay về trang chủ.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-[13px] bg-[#7C5CE6] px-5 py-3 text-[15px] font-bold text-white shadow-[0_14px_28px_-10px_rgba(124,92,230,0.5)] transition hover:bg-[#6A48D6]"
        >
          Về trang chủ
        </Link>
        <Link
          href="/products"
          className="rounded-[13px] border border-[#E4DEEE] bg-white px-5 py-3 text-[15px] font-bold text-[#564F6B] transition hover:border-[#CCC3DC]"
        >
          Xem bộ đề
        </Link>
      </div>
    </main>
  )
}
