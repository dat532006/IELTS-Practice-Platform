import Link from 'next/link'
import { LEGAL_PAGES, LEGAL_SLUGS } from '@/lib/legal'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[#EBE6F2] bg-[rgba(255,255,255,0.5)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.02em] text-[#2A2740]">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#7C5CE6]">
              <span className="block h-[11px] w-[11px] rotate-45 rounded-[3px] bg-white" />
            </span>
            <span>
              <span className="text-[#7C5CE6]">IELTS</span>Practice
            </span>
          </div>
          <p className="mt-3 text-sm leading-[1.6] text-[#857F96]">
            Đề tự soạn 100%, giao diện chuẩn thi thật. Reading · Listening · Writing.
          </p>
          <div className="mt-3 flex gap-2 text-xs text-[#857F96]">
            <span className="rounded border border-[#E4DEEE] px-2 py-0.5">Bảo mật RLS</span>
            <span className="rounded border border-[#E4DEEE] px-2 py-0.5">DMCA</span>
          </div>
        </div>

        <div>
          <div className="text-xs font-extrabold uppercase tracking-[0.04em] text-[#2A2740]">Pháp lý</div>
          <ul className="mt-3 space-y-2.5">
            {LEGAL_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  href={`/legal/${slug}`}
                  className="text-sm font-semibold text-[#564F6B] transition hover:text-[#7C5CE6]"
                >
                  {LEGAL_PAGES[slug].title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-extrabold uppercase tracking-[0.04em] text-[#2A2740]">Khác</div>
          <ul className="mt-3 space-y-2.5">
            <li>
              <Link href="/about" className="text-sm font-semibold text-[#564F6B] transition hover:text-[#7C5CE6]">
                Giới thiệu
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="text-sm font-semibold text-[#564F6B] transition hover:text-[#7C5CE6]">
                Bảng giá
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#EBE6F2] py-4 text-center text-xs font-semibold text-[#9D96AE]">
        © 2026 IELTSPractice
      </div>
    </footer>
  )
}
