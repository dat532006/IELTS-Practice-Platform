import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// W19 (M10) — robots. Chặn crawl khu vực riêng tư/không public: admin, API, dashboard cá nhân,
//   trang làm bài / kết quả (user-specific, không nên index).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/dashboard', '/exam/', '/writing/', '/result/', '/writing-result/', '/payment/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
