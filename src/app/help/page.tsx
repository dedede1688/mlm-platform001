'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface FaqItem {
  question: string
  answer: string
}

const defaultFaqs: FaqItem[] = [
  { question: "如何注册成为会员？", answer: `点击首页右上角"免费注册"，填写手机号和密码即可。注册后自动成为会员，享受会员价购物和推荐奖励。` },
  { question: "什么是推荐奖和品牌管理奖？", answer: "推荐奖是直接推荐用户消费的20%；品牌管理奖是安置链下级消费的20%，需成为经销商后才能获得。" },
  { question: "如何升级为经销商？", answer: "累计购买10件升级产品（品牌产品X），系统自动升级。升级后获得5000积分，并解锁品牌管理奖资格。" },
  { question: "积分如何使用？", answer: "在购物时可使用积分抵扣，1积分=1元，每件商品有最高抵扣比例（通常50%）。积分也可转赠给其他会员。" },
  { question: "如何联系客服？", answer: "客服电话：18566793066，服务时间：周一至周日 9:00-21:00。" }
]

export default function HelpPage() {
  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/settings/public')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setFaqs(Array.isArray(data.data.helpFaq) && data.data.helpFaq.length > 0 ? data.data.helpFaq : defaultFaqs)
        }
      })
      .catch(() => setFaqs(defaultFaqs))
      .finally(() => setLoading(false))
  }, [])

  const toggleFaq = (index: number) => {
    setOpenIndex(prev => (prev === index ? null : index))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <HelpCircle className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">帮助中心</h1>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-4 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="border border-gray-100 rounded-lg p-4">
                  <div className="h-5 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-16">
              <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">暂无常见问题</p>
              <p className="text-gray-300 text-sm mt-2">管理员可在后台添加 FAQ 内容</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {faqs.map((faq, index) => (
                <div key={index}>
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between px-6 py-4
                      hover:bg-primary-50 transition-colors text-left"
                  >
                    <span className="flex items-center gap-3 font-medium text-gray-900 pr-4">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </span>
                      {faq.question}
                    </span>
                    {openIndex === index
                      ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    }
                  </button>
                  {openIndex === index && (
                    <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}