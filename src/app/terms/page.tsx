'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'

function getDefaultTermsHtml(): string {
  return `
    <h2>用户协议</h2>
    <p>欢迎使用敏维科技健康商城（以下简称"本平台"）。在您注册成为本平台会员或使用本平台服务之前，请仔细阅读以下条款。</p>

    <h3>一、服务说明</h3>
    <p>本平台是一个综合电商平台，为用户提供优质健康产品的在线购买服务。平台保留随时修改或中断服务的权利。</p>

    <h3>二、账户注册</h3>
    <ul>
      <li>注册时请提供真实、准确、完整的个人信息</li>
      <li>用户有责任妥善保管账户密码</li>
      <li>每个用户只能注册一个账户</li>
      <li>禁止冒用他人身份注册</li>
    </ul>

    <h3>三、订单与支付</h3>
    <ul>
      <li>商品价格以结算时为准</li>
      <li>支付完成后系统将自动生成订单</li>
      <li>部分商品支持7天无理由退货（具体以商品页面说明为准）</li>
    </ul>

    <h3>四、分销规则</h3>
    <ul>
      <li>用户可通过分享专属链接获得分销佣金</li>
      <li>佣金比例由平台根据产品类别设定</li>
      <li>严禁通过虚假交易等违规方式获取佣金</li>
    </ul>

    <h3>五、隐私保护</h3>
    <p>我们重视您的隐私保护，将按照《隐私政策》的规定收集、使用和保护您的个人信息。</p>

    <h3>六、免责声明</h3>
    <ul>
      <li>本平台不对因不可抗力导致的服务中断承担责任</li>
      <li>用户应自行承担使用本平台服务的风险</li>
      <li>第三方提供的内容和服务由其自行负责</li>
    </ul>

    <h3>七、协议更新</h3>
    <p>本平台有权随时修改本协议内容。修改后的协议将在平台上公布，继续使用即表示同意修改后的协议。</p>

    <p class="text-sm text-gray-500 mt-4">最后更新：2026年6月</p>
  `
}

export default function TermsPage() {
  const [termsHtml, setTermsHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/public')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setTermsHtml(data.data.termsHtml ?? null)
        }
      })
      .catch(() => setTermsHtml(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <FileText className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">用户协议</h1>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-5/6" />
              <div className="h-4 bg-gray-200 rounded w-4/6" />
              <div className="h-4 bg-gray-200 rounded w-full" />
            </div>
          ) : (
            <div
              className="prose prose-gray max-w-none
                prose-headings:text-gray-900 prose-headings:font-semibold
                prose-p:text-gray-600 prose-p:leading-relaxed
                prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: termsHtml || getDefaultTermsHtml() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}