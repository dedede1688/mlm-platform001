'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import {
  Settings, Save, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2,
  FileText, Shield, HelpCircle, Info, Image as ImageIcon, Search, CreditCard
} from 'lucide-react'

interface FaqItem {
  question: string
  answer: string
}

interface BannerItem {
  imageUrl: string
  link?: string
  title?: string
}

interface SettingsData {
  siteName: string
  logoUrl: string
  contactPhone: string
  serviceEmail: string
  serviceTime: string
  companyName: string
  companyAddress: string
  icp: string
  copyright: string
  aboutUs: string
  termsHtml: string
  privacyHtml: string
  helpFaq: FaqItem[]
  banners: BannerItem[]
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  paymentProvider: string
  paymentMerchantId: string
  paymentSecret: string
  paymentNotifyUrl: string
}

const defaultSettings: SettingsData = {
  siteName: '敏维生物·健康商城',
  logoUrl: '/logo.png',
  contactPhone: '18566793066',
  serviceEmail: 'service@minwei.com',
  serviceTime: '周一至周日 9:00-21:00',
  companyName: '广州敏维生物科技有限公司',
  companyAddress: '广州市花都区金谷南路9号',
  icp: '粤ICP备XXXXXXXX号',
  copyright: '2026',
  aboutUs: '',
  termsHtml: '',
  privacyHtml: '',
  helpFaq: [],
  banners: [],
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  paymentProvider: 'mock',
  paymentMerchantId: '',
  paymentSecret: '',
  paymentNotifyUrl: '',
}

const fieldConfig: { key: keyof SettingsData; label: string; type?: string }[] = [
  { key: 'siteName', label: '网站名称' },
  { key: 'logoUrl', label: 'Logo 网址' },
  { key: 'contactPhone', label: '联系电话' },
  { key: 'serviceEmail', label: '客服邮箱', type: 'email' },
  { key: 'serviceTime', label: '服务时间' },
  { key: 'companyName', label: '公司名称' },
  { key: 'companyAddress', label: '公司地址' },
  { key: 'icp', label: 'ICP备案号' },
  { key: 'copyright', label: '版权年份' },
]

// 折叠面板组件
function AccordionSection({
  title, icon: Icon, isOpen, onToggle, children
}: {
  title: string
  icon: React.ElementType
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        {isOpen
          ? <ChevronUp className="w-5 h-5 text-gray-400" />
          : <ChevronDown className="w-5 h-5 text-gray-400" />
        }
      </button>
      {isOpen && (
        <div className="px-6 py-5 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}

// 富文本编辑器（textarea + 预览）
function HtmlEditor({
  label, value, onChange, placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [preview, setPreview] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
        >
          {preview ? (
            <><EyeOff className="w-3.5 h-3.5" /> 编辑</>
          ) : (
            <><Eye className="w-3.5 h-3.5" /> 预览</>
          )}
        </button>
      </div>
      {preview ? (
        <div
          className="w-full min-h-[200px] p-4 border border-gray-300 rounded-lg
            prose prose-gray max-w-none
            prose-headings:text-gray-900 prose-p:text-gray-600 prose-p:leading-relaxed
            prose-a:text-blue-600"
          dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-300">暂无内容</p>' }}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={10}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-colors text-gray-900 placeholder-gray-400 font-mono text-sm
            hover:border-gray-400 resize-y"
          placeholder={placeholder || `请输入${label}的 HTML 内容`}
        />
      )}
    </div>
  )
}

export default function AdminSettingsPage() {
  const [formData, setFormData] = useState<SettingsData>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 折叠面板状态
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success && data.data) {
        setFormData({
          siteName: data.data.siteName ?? defaultSettings.siteName,
          logoUrl: data.data.logoUrl ?? defaultSettings.logoUrl,
          contactPhone: data.data.contactPhone ?? defaultSettings.contactPhone,
          serviceEmail: data.data.serviceEmail ?? defaultSettings.serviceEmail,
          serviceTime: data.data.serviceTime ?? defaultSettings.serviceTime,
          companyName: data.data.companyName ?? defaultSettings.companyName,
          companyAddress: data.data.companyAddress ?? defaultSettings.companyAddress,
          icp: data.data.icp ?? defaultSettings.icp,
          copyright: data.data.copyright ?? defaultSettings.copyright,
          aboutUs: data.data.aboutUs ?? defaultSettings.aboutUs,
          termsHtml: data.data.termsHtml ?? defaultSettings.termsHtml,
          privacyHtml: data.data.privacyHtml ?? defaultSettings.privacyHtml,
          helpFaq: Array.isArray(data.data.helpFaq) ? data.data.helpFaq : defaultSettings.helpFaq,
          banners: Array.isArray(data.data.banners) ? data.data.banners : defaultSettings.banners,
          seoTitle: data.data.seoTitle ?? defaultSettings.seoTitle,
          seoDescription: data.data.seoDescription ?? defaultSettings.seoDescription,
          seoKeywords: data.data.seoKeywords ?? defaultSettings.seoKeywords,
          paymentProvider: data.data.paymentProvider ?? defaultSettings.paymentProvider,
          paymentMerchantId: data.data.paymentMerchantId ?? defaultSettings.paymentMerchantId,
          paymentSecret: data.data.paymentSecret ?? defaultSettings.paymentSecret,
          paymentNotifyUrl: data.data.paymentNotifyUrl ?? defaultSettings.paymentNotifyUrl,
        })
      }
    } catch (_error) {
      console.error('获取配置失败:', _error)
      setMessage({ type: 'error', text: '加载配置失败，使用默认值' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: '保存成功' })
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch (_error) {
      setMessage({ type: 'error', text: '网络错误，保存失败' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleChange = (key: keyof SettingsData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  // FAQ 操作
  const addFaq = () => {
    setFormData(prev => ({
      ...prev,
      helpFaq: [...prev.helpFaq, { question: '', answer: '' }],
    }))
  }

  const removeFaq = (index: number) => {
    setFormData(prev => ({
      ...prev,
      helpFaq: prev.helpFaq.filter((_, i) => i !== index),
    }))
  }

  const updateFaq = (index: number, field: 'question' | 'answer', value: string) => {
    setFormData(prev => ({
      ...prev,
      helpFaq: prev.helpFaq.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
  }

  // Banner 操作已迁移到独立管理页面 /admin/banners

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <>
      {/* Page Title */}
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">商城设置</h1>
      </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success'
              ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 flex-shrink-0" />
            }
            <span>{message.text}</span>
          </div>
        )}

        {/* 基础配置 */}
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">基础配置</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {fieldConfig.map(({ key, label, type }) => (
              <div key={key}>
                <label
                  htmlFor={key}
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  {label}
                </label>
                <input
                  id={key}
                  type={type || 'text'}
                  value={formData[key] as string}
                  onChange={e => handleChange(key, e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400"
                  placeholder={`请输入${label}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 高级配置（折叠面板） */}
        <div className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900">高级配置</h2>

          {/* SEO 设置 */}
          <AccordionSection
            title="SEO 设置"
            icon={Search}
            isOpen={!!openSections.seo}
            onToggle={() => toggleSection('seo')}
          >
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                配置网站的全局 SEO 信息，将应用于所有前台页面的 meta 标签，有助于搜索引擎优化。
              </p>
              <div>
                <label
                  htmlFor="seoTitle"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  网站标题（SEO Title）
                </label>
                <input
                  id="seoTitle"
                  type="text"
                  value={formData.seoTitle}
                  onChange={e => handleChange('seoTitle', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400"
                  placeholder="如：敏维生物·健康商城 - 专注健康生活"
                />
                <p className="mt-1 text-xs text-gray-400">
                  留空则使用"网站名称"作为默认标题
                </p>
              </div>
              <div>
                <label
                  htmlFor="seoDescription"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  网站描述（SEO Description）
                </label>
                <textarea
                  id="seoDescription"
                  value={formData.seoDescription}
                  onChange={e => handleChange('seoDescription', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400 resize-y"
                  placeholder="如：敏维生物健康商城，提供优质健康产品，多级分销电商平台"
                />
                <p className="mt-1 text-xs text-gray-400">
                  建议不超过 160 个字符，留空则使用默认描述
                </p>
              </div>
              <div>
                <label
                  htmlFor="seoKeywords"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  网站关键词（SEO Keywords）
                </label>
                <input
                  id="seoKeywords"
                  type="text"
                  value={formData.seoKeywords}
                  onChange={e => handleChange('seoKeywords', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400"
                  placeholder="如：健康商城,敏维生物,健康产品,分销平台"
                />
                <p className="mt-1 text-xs text-gray-400">
                  多个关键词用英文逗号分隔
                </p>
              </div>
            </div>
          </AccordionSection>

          {/* 支付配置 */}
          <AccordionSection
            title="支付配置"
            icon={CreditCard}
            isOpen={!!openSections.payment}
            onToggle={() => toggleSection('payment')}
          >
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                配置支付服务商参数。当前仅支持模拟支付，微信/支付宝为预留接口，后续集成真实 SDK。
              </p>
              <div>
                <label
                  htmlFor="paymentProvider"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  支付服务商
                </label>
                <select
                  id="paymentProvider"
                  value={formData.paymentProvider}
                  onChange={e => handleChange('paymentProvider', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400
                    bg-white appearance-none"
                >
                  <option value="mock">模拟支付（开发测试用）</option>
                  <option value="wechat">微信支付（暂未开放）</option>
                  <option value="alipay">支付宝（暂未开放）</option>
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  选择"模拟支付"可直接完成支付流程，用于开发测试
                </p>
              </div>
              <div>
                <label
                  htmlFor="paymentMerchantId"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  商户号
                </label>
                <input
                  id="paymentMerchantId"
                  type="text"
                  value={formData.paymentMerchantId}
                  onChange={e => handleChange('paymentMerchantId', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400"
                  placeholder="请输入支付服务商分配的商户号"
                />
              </div>
              <div>
                <label
                  htmlFor="paymentSecret"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  签名密钥
                </label>
                <input
                  id="paymentSecret"
                  type="password"
                  value={formData.paymentSecret}
                  onChange={e => handleChange('paymentSecret', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400
                    hover:border-gray-400"
                  placeholder="请输入签名密钥"
                />
                <p className="mt-1 text-xs text-gray-400">
                  密钥将以密码形式存储，生产环境建议使用环境变量
                </p>
              </div>
              <div>
                <label
                  htmlFor="paymentNotifyUrl"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  异步通知地址
                </label>
                <input
                  id="paymentNotifyUrl"
                  type="text"
                  value={formData.paymentNotifyUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/payment/notify`}
                  onChange={e => handleChange('paymentNotifyUrl', e.target.value)}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg
                    bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-400">
                  支付结果异步通知地址，由系统自动生成，无需手动修改
                </p>
              </div>
            </div>
          </AccordionSection>

          {/* 关于我们 */}
          <AccordionSection
            title="关于我们"
            icon={Info}
            isOpen={!!openSections.aboutUs}
            onToggle={() => toggleSection('aboutUs')}
          >
            <HtmlEditor
              label="关于我们内容（HTML）"
              value={formData.aboutUs}
              onChange={v => handleChange('aboutUs', v)}
              placeholder="输入关于我们的 HTML 内容，将在 /about 页面展示"
            />
          </AccordionSection>

          {/* 用户协议 */}
          <AccordionSection
            title="用户协议"
            icon={FileText}
            isOpen={!!openSections.termsHtml}
            onToggle={() => toggleSection('termsHtml')}
          >
            <HtmlEditor
              label="用户协议内容（HTML）"
              value={formData.termsHtml}
              onChange={v => handleChange('termsHtml', v)}
              placeholder="输入用户协议的 HTML 内容，将在 /terms 页面展示"
            />
          </AccordionSection>

          {/* 隐私政策 */}
          <AccordionSection
            title="隐私政策"
            icon={Shield}
            isOpen={!!openSections.privacyHtml}
            onToggle={() => toggleSection('privacyHtml')}
          >
            <HtmlEditor
              label="隐私政策内容（HTML）"
              value={formData.privacyHtml}
              onChange={v => handleChange('privacyHtml', v)}
              placeholder="输入隐私政策的 HTML 内容，将在 /privacy 页面展示"
            />
          </AccordionSection>

          {/* 帮助中心 FAQ */}
          <AccordionSection
            title="帮助中心 FAQ"
            icon={HelpCircle}
            isOpen={!!openSections.helpFaq}
            onToggle={() => toggleSection('helpFaq')}
          >
            <div className="space-y-4">
              {formData.helpFaq.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  暂无 FAQ 条目，点击下方按钮添加
                </p>
              )}
              {formData.helpFaq.map((faq, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">
                      FAQ #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFaq(index)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">问题</label>
                      <input
                        type="text"
                        value={faq.question}
                        onChange={e => updateFaq(index, 'question', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          hover:border-gray-400 transition-colors"
                        placeholder="输入问题"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">回答</label>
                      <textarea
                        value={faq.answer}
                        onChange={e => updateFaq(index, 'answer', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          hover:border-gray-400 transition-colors resize-y"
                        placeholder="输入回答"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addFaq}
                className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300
                  rounded-lg text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300
                  transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                添加 FAQ
              </button>
            </div>
          </AccordionSection>

          {/* 轮播图管理 */}
          <AccordionSection
            title="轮播图管理"
            icon={Image}
            isOpen={!!openSections.banners}
            onToggle={() => toggleSection('banners')}
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                轮播图已迁移至独立管理页面，支持图片上传、拖拽排序等功能。
              </p>
              <a
                href="/admin/banners"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
                  hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <ImageIcon className="w-4 h-4" />
                前往轮播图管理
              </a>
              {formData.banners.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-2">当前轮播图预览：</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {formData.banners.map((banner, index) => (
                      <div key={index} className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 h-20">
                        {banner.imageUrl ? (
                          <Image
                            src={banner.imageUrl}
                            alt={banner.title || `轮播图 ${index + 1}`}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionSection>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center gap-2 px-8 py-3 rounded-lg
              text-white font-medium transition-all text-base
              ${saving
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow'
              }`}
          >
            <Save className="w-5 h-5" />
            {saving ? '保存中...' : '保存全部设置'}
          </button>
        </div>
      </>
  )
}