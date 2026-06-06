'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'

function getDefaultAboutHtml(): string {
  return `
    <h2>公司简介</h2>
    <p>敏维生物科技有限公司专注于金花菌（冠突散囊菌）的深度研发与产业化应用，是一家集科研、生产、销售于一体的现代化生物科技企业。公司依托独有的金花菌耐高温专利技术，成功突破了金花菌在121℃高温下仍能存活的行业难题，为降血脂、调节肠道菌群等健康领域带来了革命性突破。</p>
    <p>公司核心产品金花红茶，采用传统红茶工艺与金花菌发酵技术相结合，使每克茶叶含有数以亿计的活性金花菌，为消费者提供日常便捷的健康养生方案。</p>

    <h2>科研实力</h2>
    <p>公司拥有一支由中国科学院博士领衔的顶尖研发团队，核心科研人员在金花菌领域深耕超过13年，累计获得多项国家发明专利。团队在菌种选育、发酵工艺优化、功效验证等方面积累了丰富的技术储备，为产品的科学性和有效性提供了坚实保障。</p>
    <ul>
      <li>中国科学院博士领衔研发团队</li>
      <li>13年金花菌专注研究经验</li>
      <li>多项国家发明专利授权</li>
      <li>完整的菌种选育与发酵工艺体系</li>
    </ul>

    <h2>企业文化</h2>
    <h3>使命</h3>
    <p>以科技创新赋能健康生活，让金花菌的益处惠及每一个人。</p>
    <h3>愿景</h3>
    <p>成为全球金花菌研发与应用的领军企业，推动传统茶饮与现代生物科技的深度融合。</p>
    <h3>价值观</h3>
    <p>科学严谨 · 诚信务实 · 创新驱动 · 合作共赢</p>
  `
}

export default function AboutPage() {
  const [aboutUs, setAboutUs] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/public')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setAboutUs(data.data.aboutUs ?? null)
        }
      })
      .catch(() => {
        setAboutUs(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Info className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">关于我们</h1>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-5/6" />
              <div className="h-4 bg-gray-200 rounded w-4/6" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>
          ) : aboutUs ? (
            <div
              className="prose prose-gray max-w-none
                prose-headings:text-gray-900 prose-headings:font-semibold
                prose-p:text-gray-600 prose-p:leading-relaxed
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-img:rounded-lg prose-img:shadow-sm"
              dangerouslySetInnerHTML={{ __html: aboutUs }}
            />
          ) : (
            <div
              className="prose prose-gray max-w-none
                prose-headings:text-gray-900 prose-headings:font-semibold
                prose-p:text-gray-600 prose-p:leading-relaxed
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-img:rounded-lg prose-img:shadow-sm"
              dangerouslySetInnerHTML={{ __html: getDefaultAboutHtml() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}