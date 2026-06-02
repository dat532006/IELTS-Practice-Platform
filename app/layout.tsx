import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IELTS Practice Platform',
  description:
    'Luyện thi IELTS Reading / Listening / Writing — giao diện chuẩn thi thật, AI chấm Writing.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  )
}
