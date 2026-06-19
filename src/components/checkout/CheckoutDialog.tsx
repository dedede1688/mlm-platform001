'use client'

import { useState, useEffect } from 'react'
import { X, User, Phone, MapPin, Lock, Loader2, ShoppingBag } from 'lucide-react'
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
}

export function CheckoutDialog({ open, onClose, product, onConfirm, defaultPhone = '', hasPaymentPassword = false }: CheckoutDialogProps) {
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState(defaultPhone)
  const [shippingAddress, setShippingAddress] = useState('')
  const [payPassword, setPayPassword] = useState('')
  const [showPayPwd, setShowPayPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 弹窗打开时初始化手机号为 defaultPhone；关闭时清空收货信息（保留手机号有 defaultPhone 兜底）
  useEffect(() => {
    if (open) {
      setRecipientPhone(defaultPhone)
    } else {
      const t = setTimeout(() => {
        setRecipientName('')
        setShippingAddress('')
        setPayPassword('')
        setShowPayPwd(false)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open, defaultPhone])

  if (!open || !product) return null

  const pointsUsed = product.pointsUsed || 0
  const finalPrice = Math.max(0, product.memberPrice - pointsUsed)

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
        // 成功由父组件处理跳转/弹窗关闭
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
