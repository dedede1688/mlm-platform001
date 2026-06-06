'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Save, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2,
  FileText, Shield, HelpCircle, Info, Image, ArrowUp, ArrowDown
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
        })
      }
    } catch (_error) {
      console.error('获取配置失败:', error)
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

  // Banner 操作
  const addBanner = () => {
    setFormData(prev => ({
      ...prev,
      banners: [...prev.banners, { imageUrl: '', link: '', title: '' }],
    }))
  }

  const removeBanner = (index: number) => {
    setFormData(prev => ({
      ...prev,
      banners: prev.banners.filter((_, i) => i !== index),
    }))
  }

  const updateBanner = (index: number, field: keyof BannerItem, value: string) => {
    setFormData(prev => ({
      ...prev,
      banners: prev.banners.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
  }

  const moveBanner = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const newBanners = [...prev.banners]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= newBanners.length) return prev
      ;[newBanners[index], newBanners[targetIndex]] = [newBanners[targetIndex], newBanners[index]]
      return { ...prev, banners: newBanners }
    })
  }

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
              {formData.banners.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  暂无轮播图，点击下方按钮添加
                </p>
              )}
              {formData.banners.map((banner, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">
                        轮播图 #{index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveBanner(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBanner(index, 'down')}
                          disabled={index === formData.banners.length - 1}
                          className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBanner(index)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 图片预览 */}
                  {banner.imageUrl && (
                    <div className="mb-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                      <img
                        src={banner.imageUrl}
                        alt={banner.title || `轮播图 ${index + 1}`}
                        className="w-full h-32 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">图片地址 *</label>
                      <input
                        type="text"
                        value={banner.imageUrl}
                        onChange={e => updateBanner(index, 'imageUrl', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          hover:border-gray-400 transition-colors"
                        placeholder="https://example.com/banner.jpg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">链接地址</label>
                      <input
                        type="text"
                        value={banner.link || ''}
                        onChange={e => updateBanner(index, 'link', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          hover:border-gray-400 transition-colors"
                        placeholder="https://example.com/page（可选）"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">标题</label>
                      <input
                        type="text"
                        value={banner.title || ''}
                        onChange={e => updateBanner(index, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                          hover:border-gray-400 transition-colors"
                        placeholder="轮播图标题（可选）"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addBanner}
                className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300
                  rounded-lg text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300
                  transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                添加轮播图
              </button>
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