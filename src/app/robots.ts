import type { MetadataRoute } from 'next'

// v52.0: robots.txt
// 允许所有爬虫抓取公开页面，禁止 /api/ /admin/ /dashboard/
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mlm-platform001.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/dashboard/', '/login', '/register', '/payment-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
