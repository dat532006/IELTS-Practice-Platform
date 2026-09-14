import { Header } from '@/components/layout/Header'
import { SiteFooter } from '@/components/layout/SiteFooter'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* UI-08 (CLS): loading.tsx stream skeleton ngắn + footer TRƯỚC, nội dung thật swap vào sau lần paint đầu
          (kể cả trang static) → footer hiện trong màn rồi bị đẩy xuống (CLS 0.1–0.27). min-h = 100svh − header(73px)
          − mt-16 footer(64px) + dư ~25px → footer luôn bắt đầu DƯỚI mép màn lúc skeleton, nhảy ngoài viewport = 0 CLS. */}
      <main id="main-content" tabIndex={-1} className="min-h-[calc(100svh-7rem)] min-w-0 flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
