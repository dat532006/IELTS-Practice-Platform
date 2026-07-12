import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Newsreader } from 'next/font/google'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'
import { IdleLogout } from '@/components/auth/IdleLogout'
import './globals.css'

// Design system (handoff): Plus Jakarta Sans cho toàn bộ, Newsreader italic cho accent word.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})
const newsreader = Newsreader({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500'],
  style: ['italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

// W19 (M10) — SEO cơ bản cho go-live: metadataBase (ảnh/OG tuyệt đối), title template, OpenGraph/Twitter.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${jakarta.variable} ${newsreader.variable}`}>
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        {/* Passive logout toàn site (30p; /admin 15p; trừ trang thi) — chỉ tác động khi có session */}
        <IdleLogout />
        {children}
      </body>
    </html>
  )
}
