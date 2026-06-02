import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <Link href="/" className="mb-6 text-xl font-bold text-teal-700">
        IELTS<span className="text-slate-900">Practice</span>
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {children}
      </div>
      <p className="mt-4 text-xs text-slate-400">Reading · Listening · Writing</p>
    </div>
  )
}
