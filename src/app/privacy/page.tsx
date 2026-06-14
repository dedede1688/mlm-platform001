'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

function getDefaultPrivacyHtml(): string {
  return `
    <h2>隐私政策</h2>
    <p>我们（"敏维科技"、"本平台"）深知个人信息对您的重要性，我们将按照相关法律法规的要求，采取相应的安全保护措施来保护您的个人信息。</p>

    <h3>一、信息收集</h3>
    <ul>
      <li>当您注册账户时，我们会收集您的手机号、昵称等基本信息</li>
      <li>当您下单购买商品时，我们会收集收货人姓名、地址、联系方式等信息</li>
      <li>为了改善服务质量，我们可能会自动收集您的设备信息、浏览记录等技术数据</li>
    </ul>

    <h3>二、信息使用</h3>
    <p>我们收集的信息将用于以下目的：</p>
    <ul>
      <li>创建和管理您的账户</li>
      <li>处理和配送您的订单</li>
      <li>提供客户服务和技术支持</li>
      <li>发送订单状态、促销活动等相关通知</li>
      <li>改进我们的产品和服务质量</li>
    </ul>

    <h3>三、信息共享</h3>
    <p>除以下情况外，我们不会与第三方共享您的个人信息：</p>
    <ul>
      <li>获得您的明确同意或授权</li>
      <li>法律法规要求披露</li>
      <li>与可信赖的合作伙伴（如物流服务商、支付机构）为完成交易必要</li>
    </ul>

    <h3>四、信息安全</h3>
    <p>我们采用业界标准的安全技术和管理措施来保护您的个人信息，包括但不限于：</p>
    <ul>
      <li>数据传输加密（SSL/TLS）</li>
      <li>数据库访问权限控制</li>
      <li>定期安全审计和漏洞扫描</li>
      <li>员工隐私培训</li>
    </ul>

    <h3>五、Cookie 使用</h3>
    <p>本平台可能使用 Cookie 和类似技术来：</p>
    <ul>
      <li>记住您的登录状态和偏好设置</li>
      <li>分析网站流量和使用情况</li>
      <li>提供个性化内容和推荐</li>
    </ul>
    <p>您可以通过浏览器设置管理或删除 Cookie。禁用 Cookie 可能会影响部分功能的使用。</p>

    <h3>六、信息存储期限</h3>
    <p>我们只会在实现本政策所述目的所必需的期限内保留您的个人信息。超过该期限后，我们将安全地删除或匿名化处理您的数据。</p>

    <h3>七、您的权利</h3>
    <p>根据适用法律法规，您可能享有以下权利：</p>
    <ul>
      <li>访问、更正或删除您的个人信息</li>
      <li>撤回之前给予的同意</li>
      <li>注销账户</li>
      <li>投诉或举报数据处理行为</li>
    </ul>

    <h3>八、未成年人保护</h3>
    <p>本平台主要面向成年人。如果您是未满18周岁的未成年人，请在监护人的指导下使用本平台服务。我们不会故意收集未成年人的个人信息。</p>

    <h3>九、政策更新</h3>
    <p>我们可能会不时更新本隐私政策。重大变更将通过平台公告或邮件通知您。继续使用即表示同意更新后的政策。</p>

    <p class="text-sm text-gray-500 mt-4">最后更新：2026年6月</p>
  `
}

export default function PrivacyPage() {
  const [privacyHtml, setPrivacyHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/public')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setPrivacyHtml(data.data.privacyHtml ?? null)
        }
      })
      .catch(() => setPrivacyHtml(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Shield className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">隐私政策</h1>
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
              dangerouslySetInnerHTML={{ __html: privacyHtml || getDefaultPrivacyHtml() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}