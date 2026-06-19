'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, User, Phone, MapPin, Lock, Loader2, ShoppingBag, ChevronDown, BookMarked } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

export interface CheckoutProduct {
  id: string
  name: string
  memberPrice: number
  imageUrl?: string | null
  pointsUsed?: number  // 已选积分（父组件管理）
}

export interface CheckoutInput {
  recipientName: string
  recipientPhone: string
  shippingAddress: string
  payPassword: string
}

export interface SavedAddress {
  id: string
  recipientName: string
  phone: string
  province: string
  city: string
  district: string
  detailAddress: string
  isDefault: boolean
}

interface CheckoutDialogProps {
  open: boolean
  onClose: () => void
  product: CheckoutProduct | null
  /**
   * 父组件处理下单 + 支付验证的回调
   * 返回 orderId 表示成功
   * 抛出错误或返回 null 表示失败（错误已 toast 提示）
   */
  onConfirm: (input: CheckoutInput) => Promise<{ orderId: string } | null>
  /**
   * v43-4-修复-2: 用户手机号，默认填到手机号输入框
   */
  defaultPhone?: string
  /**
   * v43-4-修复-2: 用户是否已设置支付密码
   * - true → 显示"去修改"链接
   * - false → 显示"去设置"链接
   */
  hasPaymentPassword?: boolean
  /**
   * v43-5: 用户已有地址簿（用于快速选择收货地址）
   * - 不传或空数组 → 弹窗顶部不显示地址选择器（向后兼容）
   */
  existingAddresses?: SavedAddress[]
  /**
   * v43-5: 下单成功后，把当前填写的地址保存到地址簿
   * 返回 true 表示成功（toast 已提示）
   */
  onSaveAddress?: (data: {
    recipientName: string
    phone: string
    province: string
    city: string
    district: string
    detailAddress: string
  }) => Promise<boolean>
}

const NEW_ADDRESS_VALUE = '__new__'

export function CheckoutDialog({
  open,
  onClose,
  product,
  onConfirm,
  defaultPhone = '',
  hasPaymentPassword = false,
  existingAddresses = [],
  onSaveAddress,
}: CheckoutDialogProps) {
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState(defaultPhone)
  const [shippingAddress, setShippingAddress] = useState('')
  const [payPassword, setPayPassword] = useState('')
  const [showPayPwd, setShowPayPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // v43-5: 地址簿选择
  const defaultAddr = useMemo(
    () => existingAddresses.find((a) => a.isDefault) || existingAddresses[0],
    [existingAddresses]
  )
  const [selectedAddressId, setSelectedAddressId] = useState<string>(defaultAddr?.id || NEW_ADDRESS_VALUE)
  const [saveToBook, setSaveToBook] = useState(true)  // 新地址时是否保存

  // 弹窗打开时初始化；关闭时清空
  useEffect(() => {
    if (open) {
      // 重置地址选择器到默认地址
      const da = existingAddresses.find((a) => a.isDefault) || existingAddresses[0]
      setSelectedAddressId(da?.id || NEW_ADDRESS_VALUE)
      setSaveToBook(true)
      setRecipientPhone(defaultPhone)
      // 如果有默认地址，自动填充
      if (da) {
        setRecipientName(da.recipientName)
        setRecipientPhone(da.phone)
        setShippingAddress(`${da.province} ${da.city} ${da.district} ${da.detailAddress}`)
      }
    } else {
      const t = setTimeout(() => {
        setRecipientName('')
        setShippingAddress('')
        setPayPassword('')
        setShowPayPwd(false)
        setSelectedAddressId(NEW_ADDRESS_VALUE)
        setSaveToBook(true)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open, defaultPhone, existingAddresses])

  // 选中地址变化时填充
  useEffect(() => {
    if (selectedAddressId === NEW_ADDRESS_VALUE) {
      // "使用新地址"：保留用户已输入的内容（除非是空的）
      return
    }
    const addr = existingAddresses.find((a) => a.id === selectedAddressId)
    if (addr) {
      setRecipientName(addr.recipientName)
      setRecipientPhone(addr.phone)
      setShippingAddress(`${addr.province} ${addr.city} ${addr.district} ${addr.detailAddress}`)
      setSaveToBook(false)  // 已有地址不需要保存
    }
  }, [selectedAddressId, existingAddresses])

  if (!open || !product) return null

  const pointsUsed = product.pointsUsed || 0
  const finalPrice = Math.max(0, product.memberPrice - pointsUsed)
  const showAddressPicker = existingAddresses.length > 0

  const handleConfirm = async () => {
    // 校验
    if (!recipientName.trim()) {
      toast.error('请输入收件人姓名')
      return
    }
    if (!recipientPhone.trim() || !/^1\d{10}$/.test(recipientPhone.trim())) {
      toast.error('请输入正确的手机号')
      return
    }
    if (!shippingAddress.trim()) {
      toast.error('请输入详细地址')
      return
    }
    if (!/^\d{6}$/.test(payPassword)) {
      toast.error('支付密码必须为 6 位数字')
      return
    }

    setSubmitting(true)
    try {
      const result = await onConfirm({
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        shippingAddress: shippingAddress.trim(),
        payPassword,
      })
      if (result?.orderId) {
        // v43-5: 下单成功后保存到地址簿
        if (selectedAddressId === NEW_ADDRESS_VALUE && saveToBook && onSaveAddress) {
          // 解析省市区（粗略解析；前端 picker 输入是 "省 市 区 详细地址"）
          const parts = shippingAddress.trim().split(/\s+/)
          let province = '', city = '', district = '', detail = ''
          if (parts.length >= 4) {
            province = parts[0]
            city = parts[1]
            district = parts[2]
            detail = parts.slice(3).join(' ')
          } else {
            // 用户手动输入的，没按三级格式 → 整段当详细地址
            detail = shippingAddress.trim()
          }
          try {
            const ok = await onSaveAddress({
              recipientName: recipientName.trim(),
              phone: recipientPhone.trim(),
              province,
              city,
              district,
              detailAddress: detail,
            })
            if (ok) toast.success('已保存到地址簿')
          } catch {
            // 保存失败不阻塞下单成功
          }
        }
      }
    } catch (_err) {
      // 错误已由 onConfirm 内 toast
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Sticky 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">确认订单</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 商品信息 */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-start gap-3">
            <div className="w-12 h-12 flex-shrink-0 bg-white rounded-lg overflow-hidden relative">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-base font-bold text-red-600">¥{product.memberPrice.toFixed(2)}</span>
                {pointsUsed > 0 && (
                  <span className="text-xs text-orange-600">-¥{pointsUsed.toFixed(2)} 积分</span>
                )}
              </div>
            </div>
          </div>

          {/* v43-5: 地址簿选择器（仅当有地址时显示） */}
          {showAddressPicker && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <BookMarked className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                选择收货地址
              </label>
              <div className="relative">
                <select
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  disabled={submitting}
                  className="w-full px-3.5 py-2.5 pr-10 border border-orange-300 bg-orange-50/50 rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  {existingAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.isDefault ? '★ 默认 · ' : ''}{a.recipientName} {a.phone} · {a.province} {a.city} {a.district}
                    </option>
                  ))}
                  <option value={NEW_ADDRESS_VALUE}>+ 使用新地址</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* 收件人姓名 */}
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
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
              placeholder="请输入手机号"
              maxLength={11}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* 详细地址 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              详细地址
            </label>
            <textarea
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="省/市/区/街道/门牌号"
              rows={2}
              maxLength={200}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* v43-5: 保存到地址簿 checkbox（仅在选"新地址"时显示） */}
          {selectedAddressId === NEW_ADDRESS_VALUE && onSaveAddress && (
            <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-orange-50/50 rounded-lg">
              <input
                type="checkbox"
                checked={saveToBook}
                onChange={(e) => setSaveToBook(e.target.checked)}
                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
              />
              <span className="text-xs text-gray-700">下单成功后保存到我的地址簿</span>
            </label>
          )}

          {/* 支付密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Lock className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              支付密码
            </label>
            <div className="relative">
              <input
                type={showPayPwd ? 'text' : 'password'}
                value={payPassword}
                onChange={(e) => setPayPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位数字支付密码"
                maxLength={6}
                className="w-full px-3.5 py-2.5 pr-11 border border-gray-300 rounded-lg text-center tracking-[0.5em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <button
                type="button"
                onClick={() => setShowPayPwd(!showPayPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                aria-label={showPayPwd ? '隐藏密码' : '显示密码'}
              >
                {showPayPwd ? <X className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {hasPaymentPassword ? (
                <>忘记密码？<a href="/dashboard/payment-password" className="text-blue-600 hover:underline">去修改</a></>
              ) : (
                <>未设置？<a href="/dashboard/payment-password" className="text-blue-600 hover:underline">去设置</a></>
              )}
            </p>
          </div>
        </div>

        {/* Sticky 底部按钮 */}
        <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">实付金额</span>
            <span className="text-xl font-bold text-red-600">¥{finalPrice.toFixed(2)}</span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={`w-full py-3 rounded-xl font-semibold text-base text-white transition-all ${
              submitting
                ? 'bg-orange-400 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-md'
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                处理中...
              </span>
            ) : (
              '确认下单'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CheckoutDialog