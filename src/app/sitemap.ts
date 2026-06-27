import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

// v52.0: sitemap.xml 动态生成
// 包含：静态页面 + 商品页 + 分类页
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mlm-platform001.vercel.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // ---- 静态页面 ----
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ]

  // ---- 动态商品页（仅 active）----
  let productPages: MetadataRoute.Sitemap = []
  try {
    const products = await prisma.product.findMany({
      where: { status: 'active' },
      select: { id: true, updatedAt: true },
      take: 5000,  // sitemap 单次最多 5000 条
    })
    productPages = products.map(p => ({
      url: `${SITE_URL}/products/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))
  } catch (error) {
    console.error('[sitemap] 商品查询失败:', error)
  }

  // ---- 动态分类页 ----
  let categoryPages: MetadataRoute.Sitemap = []
  try {
    const categories = await prisma.category.findMany({
      select: { id: true, updatedAt: true },
    })
    categoryPages = categories.map(c => ({
      url: `${SITE_URL}/products?categoryId=${c.id}`,
      lastModified: c.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.6,
    }))
  } catch (error) {
    console.error('[sitemap] 分类查询失败:', error)
  }

  return [...staticPages, ...categoryPages, ...productPages]
}
