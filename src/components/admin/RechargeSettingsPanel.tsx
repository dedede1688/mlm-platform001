'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, Trash2, ZoomIn } from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import ProofViewerModal from '@/components/ProofViewerModal'

/**
 * 后台充值设置独立表单
 * - 读取 /api/admin/recharge-settings（必须携带 Bearer token）
 * - 二维码上传：复用 ImageUpload，拦截 data: 本地图片，仅允许 https://
 * - 二维码预览：复用 ProofViewerModal（不打开新窗口）
 * - 保存后重新拉取接口数据覆盖表单，避免脏写
 */
interface RechargeSettingsPanelProps {
  token: string
  onMessage: (type: 'success' | 'error', text: string) => void
}

interface RechargeSettingsForm {
  enabled: boolean
  qrCodeUrl: string
  qrCodeLabel: string
  payeeName: string
  minAmount: number
  maxAmount: number
  instruction: string
  contactPhone: string
  serviceTime: string
}

const EMPTY_FORM: RechargeSettingsForm = {
  enabled: false,
  qrCodeUrl: '',
  qrCodeLabel: '平台充值二维码',
  payeeName: '',
  minAmount: 1,
  maxAmount: 50000,
  instruction: '请扫码完成付款，返回本页面填写充值金额并上传付款成功截图，等待后台审核入账。',
  contactPhone: '',
  serviceTime: '',
}

/** 将接口返回的 settings 规范化为表单所需字符串字段 */
function toForm(data: Record<string, unknown>): RechargeSettingsForm {
  return {
    enabled: data.enabled === true,
    qrCodeUrl: typeof data.qrCodeUrl === 'string' ? data.qrCodeUrl : '',
    qrCodeLabel: typeof data.qrCodeLabel === 'string' ? data.qrCodeLabel : '平台充值二维码',
    payeeName: typeof data.payeeName === 'string' ? data.payeeName : '',
    minAmount: typeof data.minAmount === 'number' && Number.isFinite(data.minAmount) ? data.minAmount : 1,
    maxAmount: typeof data.maxAmount === 'number' && Number.isFinite(data.maxAmount) ? data.maxAmount : 50000,
    instruction: typeof data.instruction === 'string' ? data.instruction : EMPTY_FORM.instruction,
    contactPhone: typeof data.contactPhone === 'string' ? data.contactPhone : '',
    serviceTime: typeof data.serviceTime === 'string' ? data.serviceTime : '',
  }
}

export default function RechargeSettingsPanel({ token, onMessage }: RechargeSettingsPanelProps) {
  const [form, setForm] = useState<RechargeSettingsForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [qrWarning, setQrWarning] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/recharge-settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        if (typeof window !== 'undefined') window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (!res.ok || !data?.success) {
        setLoadError('获取充值设置失败')
        return
      }
      setForm(toForm(data.data || {}))
    } catch {
      setLoadError('获取充值设置失败')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateField = <K extends keyof RechargeSettingsForm>(key: K, value: RechargeSettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleQrCodeChange = (url: string) => {
    if (url && !/^https:\/\//i.test(url)) {
      setQrWarning('二维码未上传到云端，请重新上传或使用 https 图片链接')
      setForm((current) => ({ ...current, qrCodeUrl: '' }))
      return
    }
    setQrWarning(null)
    setForm((current) => ({ ...current, qrCodeUrl: url }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    // 前端即时校验，后端仍为最终校验
    if (form.enabled && !form.qrCodeUrl) {
      onMessage('error', '启用充值前请先上传充值二维码')
      return
    }
    if (form.qrCodeUrl && !/^https:\/\//i.test(form.qrCodeUrl)) {
      onMessage('error', '充值二维码必须是已上传成功的 https 图片地址')
      return
    }
    if (!Number.isFinite(form.minAmount) || form.minAmount <= 0) {
      onMessage('error', '最低充值金额必须是大于 0 的有效数字')
      return
    }
    if (!Number.isFinite(form.maxAmount) || form.maxAmount <= 0) {
      onMessage('error', '最高充值金额必须是大于 0 的有效数字')
      return
    }
    if (form.maxAmount < form.minAmount) {
      onMessage('error', '最高充值金额不能低于最低充值金额')
      return
    }
    if (!form.instruction.trim()) {
      onMessage('error', '充值说明不能为空')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/recharge-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: form.enabled,
          qrCodeUrl: form.qrCodeUrl || undefined,
          qrCodeLabel: form.qrCodeLabel || undefined,
          payeeName: form.payeeName || undefined,
          minAmount: form.minAmount,
          maxAmount: form.maxAmount,
          instruction: form.instruction,
          contactPhone: form.contactPhone || undefined,
          serviceTime: form.serviceTime || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        // 失败时保留用户输入，展示接口返回的具体中文错误
        const errorText = (data?.error || '保存充值设置失败') as string
        onMessage('error', errorText)
        return
      }
      onMessage('success', '充值设置已保存')
      // 重新读取接口数据覆盖表单
      await fetchSettings()
    } catch {
      onMessage('error', '保存充值设置失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-10 flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="mt-2 text-sm">正在读取充值设置...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center text-red-500 text-sm">
        {loadError}
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">充值设置</h2>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存设置
          </button>
        </div>

        {/* 启用开关 */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
          <input
            id="recharge-enabled"
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => updateField('enabled', e.target.checked)}
            disabled={saving}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="recharge-enabled" className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">启用充值</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              停用后只阻止用户提交新的充值申请，历史记录和已有待审核申请仍可正常处理。
            </span>
          </label>
        </div>

        {/* 二维码上传 + 预览 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            充值二维码 <span className="text-red-500">*</span>
          </label>
          <ImageUpload
            value={form.qrCodeUrl}
            onChange={handleQrCodeChange}
            label=""
            placeholder="上传充值二维码或输入图片链接"
            bucket="images"
            folder="recharge-qr-codes"
            maxSizeMB={10}
            disabled={saving}
          />
          {qrWarning && (
            <p className="mt-2 text-xs text-red-500">{qrWarning}</p>
          )}
          {form.qrCodeUrl && /^https:\/\//i.test(form.qrCodeUrl) && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewUrl(form.qrCodeUrl)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
                查看大图
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm((current) => ({ ...current, qrCodeUrl: '' }))
                  setQrWarning(null)
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除二维码
              </button>
            </div>
          )}
        </div>

        {/* 二维码说明 / 收款人 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">二维码说明</label>
            <input
              type="text"
              value={form.qrCodeLabel}
              onChange={(e) => updateField('qrCodeLabel', e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400"
              placeholder="例如：平台充值二维码"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">收款人名称</label>
            <input
              type="text"
              value={form.payeeName}
              onChange={(e) => updateField('payeeName', e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400"
              placeholder="例如：某某公司财务"
            />
          </div>
        </div>

        {/* 最低 / 最高金额 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">最低充值金额</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
              <input
                type="number"
                value={form.minAmount}
                min={0.01}
                step="0.01"
                onChange={(e) => updateField('minAmount', parseFloat(e.target.value) || 0)}
                disabled={saving}
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">最高充值金额</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
              <input
                type="number"
                value={form.maxAmount}
                min={0.01}
                step="0.01"
                onChange={(e) => updateField('maxAmount', parseFloat(e.target.value) || 0)}
                disabled={saving}
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* 充值说明 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            充值说明 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.instruction}
            onChange={(e) => updateField('instruction', e.target.value)}
            disabled={saving}
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 resize-none"
            placeholder="请描述用户充值的完整流程"
          />
        </div>

        {/* 客服电话 / 服务时间 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">客服电话</label>
            <input
              type="text"
              value={form.contactPhone}
              onChange={(e) => updateField('contactPhone', e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400"
              placeholder="选填"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">服务时间</label>
            <input
              type="text"
              value={form.serviceTime}
              onChange={(e) => updateField('serviceTime', e.target.value)}
              disabled={saving}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400"
              placeholder="例如：09:00-21:00"
            />
          </div>
        </div>
      </form>

      <ProofViewerModal
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </>
  )
}
