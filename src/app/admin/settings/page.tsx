'use client'

import { useState, useEffect, useRef } from 'react'

import {
  Settings, Save, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2,
  FileText, Shield, HelpCircle, Info, Image as ImageIcon, Search, CreditCard, Upload, X
} from 'lucide-react'

// ---- 默认 HTML 兜底函数 ----

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

function getDefaultHelpFaq(): Array<{ question: string; answer: string }> {
  return [
    {
      question: '如何注册成为会员？',
      answer: '点击右上角"注册"按钮，填写手机号和验证码即可完成注册。注册成功后即可登录并享受会员权益。',
    },
    {
      question: '什么是推荐奖和品牌管理奖？',
      answer: '推荐奖：直接推荐用户消费获得的奖励（推荐人需买过 ≥1 件升级品才发放）。品牌管理奖：安置链内经销商按购买单数轮换获得，含层数上限（主任 2 层 / 经理 4 层 / 总监 10 层），无对应经销商时金额沉淀不发放。两种奖励均可提现或抵扣消费。',
    },
    {
      question: '如何升级为经销商？',
      answer: '累计推荐满 XX 人且自购消费满 XX 元后，可申请升级为经销商。经销商享受更高的佣金比例和团队管理权限。具体条件请联系客服咨询。',
    },
    {
      question: '积分如何使用？',
      answer: '在购物时可使用积分抵扣，1 积分 = 1 元，每件商品有最高抵扣比例（通常 50%）。积分也可转赠其他会员。积分有效期一般为获得之日起 1 年内有效。',
    },
    {
      question: '如何联系客服？',
      answer: '客服微信：xxx（请后台设置） | 工作时间：周一至周日 9:00-21:00 | 客服热线：18566793066',
    },
  ]
}

// ---- Logo 上传组件 ----
function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState<string | null>(value || null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreview(value || null)
  }, [value])

  const handleFile = async (file: File) => {
    setError(null)

    // 校验类型
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('仅支持 PNG / JPG / SVG / WebP / GIF 格式')
      return
    }

    // 校验大小（base64 后约 133%，所以限制 80KB）
    if (file.size > 80 * 1024) {
      setError(`文件过大（${(file.size / 1024).toFixed(1)} KB），请压缩到 80 KB 以内`)
      return
    }

    setUploading(true)
    try {
      // 转 base64
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        onChange(dataUrl)
        setPreview(dataUrl)
        setSize(dataUrl.length)
        setUploading(false)
      }
      reader.onerror = () => {
        setError('读取文件失败')
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (e: any) {
      setError(e?.message || '上传失败')
      setUploading(false)
    }
  }

  const handleClear = () => {
    onChange('')
    setPreview(null)
    setSize(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Logo 图片
      </label>

      {/* 预览区 */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
        {preview ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center bg-white rounded p-3 h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Logo 预览"
                className="max-h-20 max-w-full object-contain"
              />
            </div>
            {size && (
              <p className="text-xs text-gray-500 text-center">
                大小：{(size / 1024).toFixed(1)} KB
              </p>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <X className="w-4 h-4" />
              移除并使用默认 Logo
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-1">未上传 Logo</p>
            <p className="text-xs text-gray-400">将使用默认 Logo（/logo.svg）</p>
          </div>
        )}
      </div>

      {/* 上传按钮 */}
      <div className="mt-2 flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {uploading ? '处理中...' : (preview ? '更换 Logo' : '上传 Logo')}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {/* 帮助提示 */}
      <p className="mt-2 text-xs text-gray-400">
        支持 PNG / JPG / SVG / WebP / GIF，文件大小需 ≤ 80 KB。建议尺寸 200×60 像素
      </p>
    </div>
  )
}

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
  siteName: '敏维科技',
  logoUrl: '/logo.png',
  contactPhone: '18566793066',
  serviceEmail: '381901944@qq.com',
  serviceTime: '周一至周日 9:00-21:00',
  companyName: '广州敏维科技有限公司',
  companyAddress: '广州市花都区金谷南路',
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
  aboutUs: data.data.aboutUs || getDefaultAboutHtml(),
  termsHtml: data.data.termsHtml || getDefaultTermsHtml(),
  privacyHtml: data.data.privacyHtml || getDefaultPrivacyHtml(),
          helpFaq: (Array.isArray(data.data.helpFaq) && data.data.helpFaq.length > 0) ? data.data.helpFaq : getDefaultHelpFaq(),
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
        // 保存成功后重新拉取数据，确保输入框显示最新值
        await fetchSettings()
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
            {fieldConfig.map(({ key, label, type }) => {
              // Logo 字段单独渲染
              if (key === 'logoUrl') {
                return (
                  <LogoUploader
                    key={key}
                    value={formData.logoUrl}
                    onChange={(v) => handleChange('logoUrl', v)}
                  />
                )
              }
              return (
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
              )
            })}
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