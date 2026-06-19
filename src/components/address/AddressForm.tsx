'use client'

import { useState, useEffect } from 'react'
import { User, Phone, MapPin, Loader2 } from 'lucide-react'
import { AddressPicker, AddressPickerValue } from './AddressPicker'

export interface AddressFormData {
  recipientName: string
  phone: string
  province: string
  city: string
  district: string
  detailAddress: string
  isDefault: boolean
}

interface AddressFormProps {
  initial?: Partial<AddressFormData>
  defaultPhone?: string
  onSubmit: (data: AddressFormData) => Promise<void>
  onCancel?: () => void
  submitting?: boolean
  submitText?: string
}

const EMPTY_PCA: AddressPickerValue = { province: '', city: '', district: '' }

export function AddressForm({
  initial,
  defaultPhone = '',
  onSubmit,
  onCancel,
  submitting = false,
  submitText = '保存',
}: AddressFormProps) {
  const [recipientName, setRecipientName] = useState(initial?.recipientName || '')
  const [phone, setPhone] = useState(initial?.phone || defaultPhone)
  const [pca, setPca] = useState<AddressPickerValue>({
    province: initial?.province || '',
    city: initial?.city || '',
    district: initial?.district || '',
  })
  const [detailAddress, setDetailAddress] = useState(initial?.detailAddress || '')
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)
  const [error, setError] = useState('')

  // initial 变化时同步（编辑模式）
  useEffect(() => {
    if (initial) {
      setRecipientName(initial.recipientName || '')
      setPhone(initial.phone || defaultPhone)
      setPca({
        province: initial.province || '',
        city: initial.city || '',
        district: initial.district || '',
      })
      setDetailAddress(initial.detailAddress || '')
      setIsDefault(initial.isDefault ?? false)
    }
  }, [initial, defaultPhone])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!recipientName.trim() || recipientName.trim().length < 2 || recipientName.length > 20) {
      setError('收件人姓名长度必须为 2-20 字')
      return
    }
    if (!/^1\d{10}$/.test(phone)) {
      setError('手机号格式错误')
      return
    }
    if (!pca.province || !pca.city || !pca.district) {
      setError('请选择完整的省/市/区')
      return
    }
    if (!detailAddress.trim() || detailAddress.trim().length < 5 || detailAddress.length > 100) {
      setError('详细地址长度必须为 5-100 字')
      return
    }

    try {
      await onSubmit({
        recipientName: recipientName.trim(),
        phone,
        province: pca.province,
        city: pca.city,
        district: pca.district,
        detailAddress: detailAddress.trim(),
        isDefault,
      })
    } catch (err: any) {
      setError(err?.message || '保存失败')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* 收件人 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <User className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
          收件人姓名
        </label>
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="请输入收件人姓名"
          maxLength={20}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        />
      </div>

      {/* 手机号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <Phone className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
          手机号码
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
          placeholder="请输入手机号"
          maxLength={11}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        />
      </div>

      {/* 省市区 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
          省/市/区
        </label>
        <AddressPicker value={pca} onChange={setPca} disabled={submitting} />
      </div>

      {/* 详细地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          街道/门牌号
        </label>
        <textarea
          value={detailAddress}
          onChange={(e) => setDetailAddress(e.target.value)}
          placeholder="街道、楼栋、门牌号等（5-100 字）"
          rows={2}
          maxLength={100}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        />
        <p className="text-xs text-gray-400 mt-1">{detailAddress.length}/100</p>
      </div>

      {/* 设为默认 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
        />
        <span className="text-sm text-gray-700">设为默认地址</span>
      </label>

      {/* 按钮 */}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl font-medium text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className={`flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all ${
            submitting
              ? 'bg-orange-400 cursor-not-allowed'
              : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-md'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              保存中...
            </span>
          ) : (
            submitText
          )}
        </button>
      </div>
    </form>
  )
}

export { EMPTY_PCA }