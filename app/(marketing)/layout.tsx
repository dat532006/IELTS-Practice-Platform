import { Header } from '@/components/layout/Header'
import { SiteFooter } from '@/components/layout/SiteFooter'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
