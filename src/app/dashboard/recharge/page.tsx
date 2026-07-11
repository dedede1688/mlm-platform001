'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wallet, Loader2, CheckCircle2,
  AlertCircle, Info, Phone, Clock,
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import ImageUpload from '@/components/ImageUpload'
import ProofViewerModal from '@/components/ProofViewerModal'
import RechargeQrPanel from '@/components/recharge/RechargeQrPanel'
import { formatMoney } from '@/lib/utils/format'

/**
 * 充值设置（第一包单二维码结构）
 * - 后台只维护一张当前二维码
 * - 停用充值只阻止新申请，不影响历史记录
 */
interface RechargeSettings {
  enabled: boolean
  qrCodeUrl?: string
  qrCodeLabel?: string
  payeeName?: string
  minAmount: number
  maxAmount: number
  instruction: string
  contactPhone?: string
  serviceTime?: string
}

interface RechargeRecord {
  id: string
  amount: number
  status: string
  paymentMethod: string
  paymentProofUrl: string
  createdAt: string
  rejectReason: string | null
  reviewedAt: string | null
  approvedAt: string | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'text-yellow-600 bg-yellow-50' },
  approved: { label: '已通过', color: 'text-green-600 bg-green-50' },
  rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50' },
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  qr_code: '二维码扫码充值',
  alipay: '支付宝',
  wechat: '微信',
  bank_card: '银行卡',
}

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000]

export default function RechargePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [settings, setSettings] = useState<RechargeSettings | null>(null)
  const [settingsLoadError, setSettingsLoadError] = useState(false)

  const [userPhone, setUserPhone] = useState('')

  const [amount, setAmount] = useState('')
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [proofWarning, setProofWarning] = useState(false)
  const [remark, setRemark] = useState('')

  const [records, setRecords] = useState<RechargeRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordPage, setRecordPage] = useState(1)
  const [recordTotalPages, setRecordTotalPages] = useState(1)
  const recordPageSize = 10
  const [submitted, setSubmitted] = useState(false)
  const [proofViewerUrl, setProofViewerUrl] = useState<string | null>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchSettings(storedToken)
    fetchUserPhone(storedToken)
    fetchRecords(storedToken)
  }, [router])

  const fetchSettings = async (authToken: string) => {
    setSettingsLoadError(false)
    try {
      const res = await fetch('/api/user/recharge-settings', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSettings(data.data)
          return
        }
      }
      // 接口失败但有响应（非 2xx 或 success=false）→ 标记为读取失败
      setSettingsLoadError(true)
    } catch {
      setSettingsLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserPhone = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        const phone = data?.data?.phone || data?.phone || ''
        if (typeof phone === 'string') {
          setUserPhone(phone)
        }
      }
    } catch {
      // 手机号仅用于展示，读取失败不影响充值流程
    }
  }

  const fetchRecords = async (authToken: string, page: number = 1) => {
    setRecordsLoading(true)
    try {
      const res = await fetch(`/api/user/recharge?page=${page}&limit=${recordPageSize}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.requests) {
          setRecords(data.data.requests)
          setRecordTotalPages(data.data.pagination?.totalPages || 1)
        }
      }
    } catch (error) {
      console.error('获取充值记录失败:', error)
    } finally {
      setRecordsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('请输入有效的充值金额')
      return
    }

    if (settings) {
      if (numAmount < settings.minAmount) {
        toast.error(`最低充值金额 ¥${settings.minAmount}`)
        return
      }
      if (numAmount > settings.maxAmount) {
        toast.error(`单笔最高充值金额 ¥${settings.maxAmount}`)
        return
      }
    }

    if (!paymentProofUrl || !paymentProofUrl.trim()) {
      toast.error('请上传付款凭证')
      return
    }

    if (!/^https:\/\//i.test(paymentProofUrl.trim())) {
      toast.error('付款凭证必须是已上传成功的图片链接（https:// 开头），Base64 本地图片不可用')
      return
    }

    setSubmitting(true)
    try {
      // 注意：提交请求中不再发送 paymentMethod，由服务端固定写入 qr_code
      const res = await fetch('/api/user/recharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: numAmount,
          paymentProofUrl: paymentProofUrl.trim(),
          remark: remark || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('充值申请提交成功，请等待审核')
        setSubmitted(true)
        // 重置表单
        setAmount('')
        setPaymentProofUrl('')
        setRemark('')
        // 刷新记录
        if (token) fetchRecords(token, recordPage)
      } else {
        toast.error(data.error || '提交失败')
      }
    } catch (error) {
      console.error('Submit recharge error:', error)
      toast.error('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const formatRelativeTime = (s: string) => {
    const diff = Date.now() - new Date(s).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}天前`
    return new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const formatDateTime = (s: string | null) => {
    if (!s) return '-'
    return new Date(s).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const handleRecordPageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= recordTotalPages) {
      setRecordPage(newPage)
      fetchRecords(token, newPage)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="h-40 bg-white rounded-xl shadow-sm animate-pulse mb-4" />
          <div className="h-60 bg-white rounded-xl shadow-sm animate-pulse" />
        </div>
      </div>
    )
  }

  // 判定主分支：设置读取成功且已启用 && 已有二维码 → 启用态；其他情况见分支
  const isEnabled = settings?.enabled === true && !!settings?.qrCodeUrl
  const isDisabledBySettings = settings && settings.enabled === false
  const isLoadError = settingsLoadError || (settings === null && !loading)

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
      {/* 顶栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            充值
          </h1>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* 顶部说明 banner */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-700">
            <p className="font-medium mb-1">充值说明</p>
            <p>充值余额仅用于购物消费，<span className="font-semibold">不可提现</span>。请扫描平台二维码完成付款，付款后填写金额并上传付款成功截图，等待后台审核入账。</p>
            {(settings?.serviceTime || settings?.contactPhone) && (
              <div className="mt-2 text-xs text-orange-600 space-y-0.5">
                {settings.contactPhone && (
                  <p>客服电话：{settings.contactPhone}</p>
                )}
                {settings.serviceTime && (
                  <p>客服服务时间：{settings.serviceTime}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 设置读取失败（注意：不能伪装成"充值关闭"） */}
        {isLoadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium mb-1">充值设置读取失败，请稍后刷新</p>
              <p className="text-xs">您仍可在下方查看历史充值记录。</p>
            </div>
          </div>
        )}

        {/* 停用状态：隐藏二维码 + 申请表单，仅展示关闭提示 + 客服信息 */}
        {isDisabledBySettings && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center space-y-3">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-gray-100 rounded-full">
              <AlertCircle className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-base font-medium text-gray-900">充值服务暂时关闭，请联系客服</p>
            {(settings?.contactPhone || settings?.serviceTime) && (
              <div className="text-sm text-gray-600 space-y-1">
                {settings.contactPhone && (
                  <p className="flex items-center justify-center gap-1.5">
                    <Phone className="w-4 h-4" />
                    客服电话：{settings.contactPhone}
                  </p>
                )}
                {settings.serviceTime && (
                  <p className="flex items-center justify-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    服务时间：{settings.serviceTime}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 启用状态：展示二维码 + 申请表单 */}
        {isEnabled && settings && (
          <>
            <RechargeQrPanel
              qrCodeUrl={settings.qrCodeUrl as string}
              qrCodeLabel={settings.qrCodeLabel}
              payeeName={settings.payeeName}
              instruction={settings.instruction}
            />

            {/* 充值表单 */}
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-5 space-y-5">
              <h3 className="text-base font-semibold text-gray-900">提交充值申请</h3>

              {/* 登录手机号（只读） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  登录手机号
                </label>
                <input
                  type="text"
                  value={userPhone}
                  readOnly
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-700 cursor-not-allowed"
                  placeholder={userPhone ? '' : '加载中...'}
                />
                <p className="text-xs text-gray-400 mt-1">手机号仅用于展示，提交充值时不会上传</p>
              </div>

              {/* 金额输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  充值金额
                  {settings && (
                    <span className="text-xs text-gray-400 ml-2">
                      （¥{settings.minAmount} - ¥{settings.maxAmount}）
                    </span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="请输入充值金额"
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-gray-900 placeholder-gray-400"
                    min={settings?.minAmount || 1}
                    max={settings?.maxAmount || 50000}
                  />
                </div>
                {/* 快捷金额 */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(String(amt))}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary transition-colors"
                    >
                      ¥{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 付款凭证上传 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  付款成功截图
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <ImageUpload
                  value={paymentProofUrl}
                  onChange={(url: string) => {
                    if (url && !url.startsWith('https://')) {
                      // Base64 fallback 或非 https 链接：不保存到 state，提示用户
                      setProofWarning(true)
                      setPaymentProofUrl('')
                      return
                    }
                    setProofWarning(false)
                    setPaymentProofUrl(url)
                  }}
                  label=""
                  placeholder="输入凭证图片URL或拖拽上传"
                  bucket="images"
                  folder="recharge-proofs"
                  maxSizeMB={10}
                />
                {proofWarning && (
                  <div className="mt-2 flex items-start gap-1.5 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">
                      凭证图片未上传到云端，请重新上传或使用图片链接。付款凭证必须是已上传成功的 https:// 图片链接。
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">请上传转账成功截图作为付款凭证，凭证必须为已上传成功的图片链接</p>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  备注 <span className="text-gray-400 text-xs">（选填）</span>
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="如有特殊说明请填写"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors text-gray-900 placeholder-gray-400 resize-none"
                />
              </div>

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    提交中...
                  </>
                ) : (
                  '提交充值申请'
                )}
              </button>

              {submitted && (
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-700">
                    <p className="font-medium">充值申请已提交</p>
                    <p className="text-xs mt-0.5">请等待后台审核，审核通过后余额将自动入账。您可以在下方查看申请记录。</p>
                  </div>
                </div>
              )}
            </form>
          </>
        )}

        {/* 充值记录（无论启用/停用/读取失败都展示） */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">充值记录</h3>
          </div>

          {recordsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-gray-400">加载中...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">暂无充值记录</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {records.map((record) => {
                  const statusConf = STATUS_MAP[record.status] || { label: record.status, color: 'text-gray-600 bg-gray-50' }
                  const methodLabel = PAYMENT_METHOD_MAP[record.paymentMethod] || record.paymentMethod
                  return (
                    <div key={record.id} className="p-3 bg-gray-50 rounded-lg">
                      {/* 第一行：金额 + 状态 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900">¥{formatMoney(record.amount)}</span>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusConf.color}`}>
                            {statusConf.label}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{formatRelativeTime(record.createdAt)}</span>
                      </div>
                      {/* 第二行：支付方式 + 付款凭证 */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 mb-1">
                        <span>支付方式：{methodLabel}</span>
                        {record.paymentProofUrl ? (
                          <button
                            type="button"
                            onClick={() => setProofViewerUrl(record.paymentProofUrl)}
                            className="text-primary hover:underline"
                          >
                            查看凭证
                          </button>
                        ) : (
                          <span className="text-gray-300">凭证：-</span>
                        )}
                      </div>
                      {/* 第三行：提交时间 + 审核时间 */}
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>提交时间：{formatDateTime(record.createdAt)}</span>
                        <span>审核时间：{formatDateTime(record.reviewedAt)}</span>
                      </div>
                      {/* 拒绝原因（仅 rejected 显示） */}
                      {record.status === 'rejected' && (
                        <div className="mt-2 text-xs text-red-500">
                          拒绝原因：{record.rejectReason || '-'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 分页 */}
              {recordTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => handleRecordPageChange(recordPage - 1)}
                    disabled={recordPage <= 1}
                    className="px-3 py-1.5 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 shadow-sm"
                  >
                    上一页
                  </button>
                  <span className="text-sm text-gray-500">第 {recordPage} / {recordTotalPages} 页</span>
                  <button
                    onClick={() => handleRecordPageChange(recordPage + 1)}
                    disabled={recordPage >= recordTotalPages}
                    className="px-3 py-1.5 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 shadow-sm"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 风险提示 */}
        <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            请务必通过官方渠道转账并保留凭证。充值申请提交后无法撤销，审核结果将通过通知告知。
          </p>
        </div>
      </main>

      <ProofViewerModal
        url={proofViewerUrl}
        onClose={() => setProofViewerUrl(null)}
      />
    </div>
  )
}
