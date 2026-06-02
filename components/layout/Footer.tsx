import Link from 'next/link'
import { LEGAL_PAGES, LEGAL_SLUGS } from '@/lib/legal'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <div className="text-lg font-bold text-teal-700">IELTS Practice</div>
          <p className="mt-2 text-sm text-slate-600">
            Đề tự soạn 100%, giao diện chuẩn thi thật. Reading · Listening · Writing.
          </p>
          <div className="mt-3 flex gap-2 text-xs text-slate-500">
            <span className="rounded border border-slate-300 px-2 py-0.5">Bảo mật RLS</span>
            <span className="rounded border border-slate-300 px-2 py-0.5">DMCA</span>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-800">Pháp lý</div>
          <ul className="mt-2 space-y-1">
            {LEGAL_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  href={`/legal/${slug}`}
                  className="text-sm text-slate-600 hover:text-teal-700"
                >
                  {LEGAL_PAGES[slug].title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-800">Khác</div>
          <ul className="mt-2 space-y-1">
            <li>
              <Link href="/about" className="text-sm text-slate-600 hover:text-teal-700">
                Giới thiệu
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="text-sm text-slate-600 hover:text-teal-700">
                Bảng giá
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        © 2026 IELTS Practice Platform
      </div>
    </footer>
  )
}
