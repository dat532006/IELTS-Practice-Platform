import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { LEGAL_SLUGS } from '@/lib/legal'

// W19 (M10) — sitemap các route public ổn định + 7 trang legal (phục vụ duyệt merchant/SEO).
// Không liệt kê slug sản phẩm động ở đây để tránh phụ thuộc DB lúc build; product pages vẫn crawl được qua /products.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const core = ['', '/products', '/pricing', '/about', '/free', '/prediction'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.7,
  }))
  const legal = LEGAL_SLUGS.map((slug) => ({
    url: `${SITE_URL}/legal/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.3,
  }))
  return [...core, ...legal]
}
