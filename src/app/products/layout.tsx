// v53.1: 商品列表页 server layout
// 职责：
// 1. 静态 metadata（标题/描述/canonical/OG）
// 2. 输出 BreadcrumbList JSON-LD（首页 > 商品）
// page.tsx（client）保持不变，所有交互逻辑由 layout 包裹
//
// 设计权衡：
// 父 layout 输出 2 级面包屑，子 layout [id]/layout.tsx 输出 3 级面包屑。
// 在 /products/[id] 详情页会同时存在两个 BreadcrumbList script。
// Google 文档：遇到多个 BreadcrumbList 时优先选最具体的，2 级会被忽略。
// 实际影响：DOM 多 1 个冗余 script，SEO 不受影响。

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mlm-platform001.vercel.app'

interface BreadcrumbItem {
  '@type': 'ListItem'
  position: number
  name: string
  item: string
}
interface BreadcrumbLd {
  '@context': string
  '@type': 'BreadcrumbList'
  itemListElement: BreadcrumbItem[]
}

function buildBreadcrumbLd(): BreadcrumbLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '商品', item: `${SITE_URL}/products` },
    ],
  }
}

export const metadata = {
  title: '商品中心 - 浏览所有商品',
  description: '浏览 mlm-platform 全部商品，会员专享价格 + 积分奖励。',
  alternates: { canonical: `${SITE_URL}/products` },
  openGraph: {
    title: '商品中心',
    description: '浏览 mlm-platform 全部商品，会员专享价格 + 积分奖励。',
    type: 'website',
    url: `${SITE_URL}/products`,
  },
}

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  const breadcrumbLdJson = JSON.stringify(buildBreadcrumbLd())
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbLdJson }}
      />
      {children}
    </>
  )
}
