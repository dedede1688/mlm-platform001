import Link from 'next/link'
import Image from 'next/image'
import { prisma } from '@/lib/prisma'
import BannerSlider from '@/components/BannerSlider'
import {
  FlaskConical, Microscope, Award, HeartPulse,
  Users, TrendingUp, Coins, ShoppingBag, Star, Flame
} from 'lucide-react'

export const dynamic = 'force-dynamic'

// ---- 类型 ----

interface BannerItem {
  imageUrl: string
  link?: string
  title?: string
}

interface ProductItem {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  retailPrice: number
  memberPrice: number
  benefits: string[] | null
}

// ---- 数据获取 ----

async function getBanners(): Promise<BannerItem[]> {
  try {
    const records = await prisma.banners.findMany({
      orderBy: { order: 'asc' },
    })
    return records.map(record => ({
      imageUrl: record.image_url,
      link: record.link ?? undefined,
      title: record.title ?? undefined,
    }))
  } catch {
    return []
  }
}

async function getProducts(): Promise<ProductItem[]> {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'active' },
      orderBy: { sortOrder: 'asc' },
      take: 4,
    })
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      retailPrice: p.retailPrice,
      memberPrice: p.memberPrice,
      benefits: p.benefits as string[] | null,
    }))
  } catch {
    return []
  }
}

// ---- 默认轮播图 ----

const DEFAULT_BANNERS: BannerItem[] = [
  { imageUrl: 'https://picsum.photos/1200/400?random=1', link: '/products', title: '健康生活从这里开始' },
  { imageUrl: 'https://picsum.photos/1200/400?random=2', link: '/products', title: '耐高温金花菌 · 专利认证' },
  { imageUrl: 'https://picsum.photos/1200/400?random=3', link: '/register', title: '加入分销 · 三重奖励' },
]

// ---- 品牌故事卖点 ----

const BRAND_POINTS = [
  {
    icon: FlaskConical,
    title: '源自青藏高原',
    desc: '耐高温121℃',
    detail: '冠突散囊菌（金花菌）从青藏高原特殊环境中筛选，经121℃高温仍保持活性',
  },
  {
    icon: Microscope,
    title: '中科院博士团队',
    desc: '13年科研',
    detail: '由中科院博士团队历经13年潜心研究，从实验室到量产全程可控',
  },
  {
    icon: HeartPulse,
    title: '降血脂 · 调肠道',
    desc: '增强免疫',
    detail: '经科学验证，可降血脂、调节肠道菌群、增强免疫力，三重健康守护',
  },
  {
    icon: Award,
    title: '从实验室到量产',
    desc: '专利认证',
    detail: '拥有完整知识产权体系，多项发明专利认证，品质有保障',
  },
]

// ---- 会员权益 ----

const MEMBER_REWARDS = [
  {
    icon: Users,
    title: '推荐喜悦',
    desc: '分享健康，向往美好，每一份分享都将获得丰厚回报',
    color: 'text-green-600 bg-green-50',
  },
  {
    icon: TrendingUp,
    title: '品牌管理有惊喜',
    desc: '团队荣誉有价值，共同成长，业绩节节高升',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    icon: Coins,
    title: '分红得奖',
    desc: '晋职加薪年年有，共享平台发展红利，财源滚滚来',
    color: 'text-amber-600 bg-amber-50',
  },
]

// ---- 科研机构 ----

const RESEARCH_ORGS = [
  '上海市公共卫生临床中心',
  '中国微生物菌种保藏中心',
  '中国科学院',
  '国家食品药品监督管理总局',
]

// ---- 主页面 ----

export default async function Home() {
  const banners = await getBanners()
  const products = await getProducts()
  const displayBanners = banners.length > 0 ? banners : DEFAULT_BANNERS

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ====== 1. 轮播图 ====== */}
        <section className="mb-12 animate-fade-in">
          <BannerSlider banners={displayBanners} />
        </section>

        {/* ====== 1.5 科技感广告条 ====== */}
        <section className="mb-8 animate-fade-in">
          <div
            className="rounded-xl shadow-lg py-4 md:py-6 px-4 flex flex-col md:flex-row justify-between items-center gap-2"
            style={{ background: 'linear-gradient(135deg, #1D4ED8, #2D6A4F)' }}
          >
            <div className="flex items-center gap-2 text-center md:text-left">
              <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                <Flame className="w-3 h-3" />
                HOT
              </span>
              <span className="text-xl md:text-2xl lg:text-3xl font-bold text-white">
                耐高温金花菌 | 121℃ 活性依旧
              </span>
            </div>
            <p className="text-sm md:text-base text-white/90 text-center md:text-right">
              中科院博士团队研发 · 13年科研沉淀 · 降血脂专利技术
            </p>
          </div>
        </section>

        {/* ====== 2. 品牌故事 ====== */}
        <section className="mb-10 sm:mb-16">
          <h2 className="section-title">专注健康解决方案</h2>
          <p className="section-subtitle">耐高温金花菌专家</p>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {BRAND_POINTS.map((item, i) => (
              <div
                key={i}
                className="card-base card-body text-center animate-slide-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-2 sm:mb-4">
                  <item.icon className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
                </div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1">{item.title}</h3>
                <p className="text-xs sm:text-base text-secondary font-bold mb-1 sm:mb-2">{item.desc}</p>
                <p className="text-xs sm:text-sm text-gray-500 line-clamp-2 sm:line-clamp-none">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ====== 3. 明星产品 ====== */}
        <section className="mb-10 sm:mb-16">
          <h2 className="section-title">热门产品推荐</h2>
          <p className="section-subtitle">甄选优质健康产品，为您的健康护航</p>
          {products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无商品，敬请期待</p>
            </div>
          )}
          <div className="text-center mt-8">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-primary hover:text-primary-600 font-medium transition-colors"
            >
              查看全部商品
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ====== 4. 健康科普 ====== */}
        <section className="mb-10 sm:mb-16">
          <h2 className="section-title">高血脂与肠道菌群的秘密</h2>
          <p className="section-subtitle">科学解读冠突散囊菌（金花菌）的健康价值</p>
          <div className="card-base overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* 左侧文字 */}
              <div className="p-4 sm:p-6 lg:p-8">
                <div className="prose prose-sm max-w-none text-gray-600">
                  <h3 className="text-lg font-semibold text-gray-900 !mt-0">冠突散囊菌如何降血脂？</h3>
                  <p>
                    冠突散囊菌（俗称"金花菌"）是一种珍稀益生菌，因其能耐121℃高温而极具应用价值。
                    研究表明，金花菌可通过调节肠道菌群结构，促进有益菌增殖，抑制有害菌生长，从而实现降血脂的效果。
                  </p>
                  <div className="bg-primary-50 rounded-lg p-4 !my-4">
                    <h4 className="font-semibold text-primary !mt-0 !mb-2">核心实验数据</h4>
                    <ul className="space-y-1.5 text-sm !mb-0">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">&#10003;</span>
                        动物实验显示甘油三酯下降 <strong className="text-primary">60%</strong>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">&#10003;</span>
                        总胆固醇水平降低 <strong className="text-primary">35%</strong>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">&#10003;</span>
                        有益菌（双歧杆菌）数量增加 <strong className="text-primary">3倍</strong>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">&#10003;</span>
                        经121℃高温处理后活性保持率 &gt; <strong className="text-primary">90%</strong>
                      </li>
                    </ul>
                  </div>
                  <p>
                    金花菌不仅降血脂，还可通过调节肠道微生态，增强人体免疫力，形成 "降血脂 + 调肠道 + 增免疫"
                    三重健康守护。这一发现为高血脂人群提供了全新的天然解决方案。
                  </p>
                </div>
              </div>
              {/* 右侧示意 */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
                <div className="text-center">
                  {/* 简易SVG图表 */}
                  <svg viewBox="0 0 200 160" className="w-full max-w-xs mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* 坐标轴 */}
                    <line x1="30" y1="10" x2="30" y2="130" stroke="#2D6A4F" strokeWidth="1.5" />
                    <line x1="30" y1="130" x2="190" y2="130" stroke="#2D6A4F" strokeWidth="1.5" />
                    {/* 柱形 - 甘油三酯 */}
                    <rect x="45" y="30" width="24" height="100" rx="4" fill="#2D6A4F" opacity="0.3" />
                    <rect x="45" y="70" width="24" height="60" rx="4" fill="#2D6A4F" opacity="0.8" />
                    <text x="57" y="145" textAnchor="middle" fontSize="9" fill="#374151">甘油三酯</text>
                    {/* 柱形 - 总胆固醇 */}
                    <rect x="85" y="20" width="24" height="110" rx="4" fill="#2D6A4F" opacity="0.3" />
                    <rect x="85" y="55" width="24" height="75" rx="4" fill="#2D6A4F" opacity="0.8" />
                    <text x="97" y="145" textAnchor="middle" fontSize="9" fill="#374151">总胆固醇</text>
                    {/* 柱形 - 有益菌 */}
                    <rect x="125" y="90" width="24" height="40" rx="4" fill="#F59E0B" opacity="0.3" />
                    <rect x="125" y="40" width="24" height="90" rx="4" fill="#F59E0B" opacity="0.8" />
                    <text x="137" y="145" textAnchor="middle" fontSize="9" fill="#374151">有益菌</text>
                    {/* 柱形 - 存活率 */}
                    <rect x="165" y="25" width="24" height="105" rx="4" fill="#2D6A4F" opacity="0.3" />
                    <rect x="165" y="30" width="24" height="100" rx="4" fill="#2D6A4F" opacity="0.8" />
                    <text x="177" y="145" textAnchor="middle" fontSize="9" fill="#374151">存活率</text>
                    {/* 标注 */}
                    <text x="20" y="75" textAnchor="middle" fontSize="8" fill="#6b7280" transform="rotate(-90, 20, 75)">变化量</text>
                    {/* 图例 */}
                    <rect x="50" y="155" width="10" height="6" rx="1" fill="#2D6A4F" opacity="0.3" />
                    <text x="63" y="161" fontSize="7" fill="#6b7280">对照</text>
                    <rect x="90" y="155" width="10" height="6" rx="1" fill="#2D6A4F" opacity="0.8" />
                    <text x="103" y="161" fontSize="7" fill="#6b7280">金花菌</text>
                  </svg>
                  <p className="text-xs text-gray-400 mt-2">*数据来源于动物实验，仅供参考</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== 5. 会员权益 ====== */}
        <section className="mb-10 sm:mb-16">
          <h2 className="section-title">加入我们，享丰厚奖励</h2>
          <p className="section-subtitle">推荐有奖励 + 品牌管理有奖励 + 还有分红，收益源源不断</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {MEMBER_REWARDS.map((item, i) => {
              const [textColor, bgColor] = item.color.split(' ')
              return (
                <div
                  key={i}
                  className="card-base card-body text-center animate-slide-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className={`w-16 h-16 rounded-full ${bgColor} flex items-center justify-center mx-auto mb-4`}>
                    <item.icon className={`w-8 h-8 ${textColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-500 text-sm">{item.desc}</p>
                </div>
              )
            })}
          </div>
          <div className="text-center mt-6 sm:mt-8">
            <Link
              href="/register"
              className="inline-block bg-secondary text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg text-base sm:text-lg hover:bg-secondary-600 transition-colors shadow-lg hover:shadow-xl font-medium"
            >
              立即加入，开启收益
            </Link>
          </div>
        </section>

        {/* ====== 6. 科研认证墙 ====== */}
        <section className="mb-10 sm:mb-16">
          <h2 className="section-title">科研认证与合作机构</h2>
          <p className="section-subtitle">权威认证，品质保证</p>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-3 sm:gap-4">
            {RESEARCH_ORGS.map((org, i) => (
              <div
                key={i}
                className="card-base px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 animate-slide-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <Star className="w-4 h-4 sm:w-5 sm:h-5 text-secondary flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-gray-700">{org}</span>
              </div>
            ))}
          </div>
        </section>

      </main>

    </div>
  )
}

// ---- 商品卡片子组件 ----

function ProductCard({ product }: { product: ProductItem }) {
  return (
    <Link href={`/products/${product.id}`} className="card-base overflow-hidden group">
      {/* 商品图片 */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300" />
          </div>
        )}
      </div>
      {/* 商品信息 */}
      <div className="p-2 sm:p-3 md:p-4">
        <h3 className="font-medium text-gray-900 text-xs sm:text-sm md:text-base truncate mb-0.5 sm:mb-1">{product.name}</h3>
        {/* 功效标签 */}
        {(() => { const benefits = Array.isArray(product.benefits) ? product.benefits : []; return benefits.length > 0 && (
          <div className="flex flex-wrap gap-0.5 sm:gap-1 mb-1 sm:mb-2">
            {benefits.slice(0, 3).map((tag, i) => (
              <span key={i} className="text-[10px] sm:text-xs bg-primary-50 text-primary px-1 sm:px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        ) })()}
        {/* 价格 */}
        <div className="flex items-baseline gap-1 sm:gap-2">
          <span className="text-primary font-bold text-sm sm:text-lg">¥{product.memberPrice}</span>
          <span className="text-gray-400 text-[10px] sm:text-xs line-through">¥{product.retailPrice}</span>
        </div>
        <div className="mt-1.5 sm:mt-2">
          <span className="inline-block w-full text-center bg-primary text-white text-xs sm:text-sm py-1 sm:py-1.5 rounded-lg group-hover:bg-primary-600 transition-colors">
            立即购买
          </span>
        </div>
      </div>
    </Link>
  )
}