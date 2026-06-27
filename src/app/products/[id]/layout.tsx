import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'

// v52.3: 产品详情页 server layout
// 职责：
// 1. generateMetadata 返回产品特定 OG meta（标题/描述/图片）
// 2. 输出 JSON-LD 结构化数据（Google Rich Results：价格/库存）
// page.tsx（client）保持不变，所有交互逻辑由 layout 包裹

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mlm-platform001.vercel.app'

interface ProductLd {
  '@context': string
  '@type': string
  name: string
  description?: string
  sku: string
  image?: string
  offers: {
    '@type': string
    price: string
    priceCurrency: string
    availability: string
    url: string
  }
}

// v52.3: 构建 Product schema JSON-LD
function buildProductLd(p: {
  id: string
  name: string
  description: string | null
  images: unknown
  memberPrice: number
  retailPrice: number
  stock: number
}): ProductLd {
  const images = Array.isArray(p.images) ? p.images as string[] : []
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description || undefined,
    sku: p.id,
    image: images[0] || undefined,
    offers: {
      '@type': 'Offer',
      price: (p.memberPrice || p.retailPrice).toFixed(2),
      priceCurrency: 'CNY',
      availability: p.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/products/${p.id}`,
    },
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      select: { name: true, description: true, images: true, memberPrice: true },
    })
    if (!product) return {}

    const images = Array.isArray(product.images) ? product.images as string[] : []
    const description = product.description?.slice(0, 160)

    return {
      title: `${product.name} - 立即购买`,
      description,
      openGraph: {
        title: product.name,
        description,
        images: images.slice(0, 1).map(url => ({ url, width: 800, height: 800, alt: product.name })),
        type: 'website',
      },
      alternates: { canonical: `${SITE_URL}/products/${id}` },
    }
  } catch (error) {
    console.error('[ProductLayout generateMetadata]', error)
    return {}
  }
}

export default async function ProductLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }
) {
  const { id } = await params
  let ldJson: string | null = null

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        images: true,
        memberPrice: true,
        retailPrice: true,
        stock: true,
      },
    })
    if (product) {
      ldJson = JSON.stringify(buildProductLd(product))
    }
  } catch (error) {
    console.error('[ProductLayout] JSON-LD fetch failed:', error)
  }

  return (
    <>
      {ldJson && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ldJson }}
        />
      )}
      {children}
    </>
  )
}
