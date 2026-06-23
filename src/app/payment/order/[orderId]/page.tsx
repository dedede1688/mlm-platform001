'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft, CreditCard, CheckCircle2, AlertCircle,
  Loader2, Shield, Lock
} from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

// ---- 类型 ----

interface OrderItemProduct {
  id: string
  name: string
  imageUrl: string | null
}

interface OrderItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  product: OrderItemProduct
}

interface Order {
  id: string
  orderNo: string
  totalAmount: number
  payAmount: number
  pointsUsed: number
  pointsDiscount: number
  status: string
  createdAt: string
  items: OrderItem[]
}

type PaymentProvider = 'mock' | 'wechat' | 'alipay'

// ---- 辅助函数 ----

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  mock: '模拟支付',
  wechat: '微信支付',
  alipay: '支付宝',
}

// ---- 组件 ----

export default function PaymentPage() {
  const router = useRouter()
  const params = useParams<{ orderId: string }>()
  const orderId = params.orderId

  const [order, setOrder] = useState<Order | null>(null)
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('mock')
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paySuccess, setPaySuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    fetchData(token)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async (token: string) => {
    try {
      // 并行获取订单和支付配置
      const [orderRes, settingsRes] = await Promise.all([
        fetch(`/api/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/settings/public'),
      ])

      // 订单数据
      const orderData = await orderRes.json()
      if (orderData.success && orderData.data) {
        if (orderData.data.status !== 'pending') {
          setError('该订单已支付或已取消')
          setLoading(false)
          return
        }
        setOrder(orderData.data)
      } else {
        setError(orderData.error || '订单不存在')
        setLoading(false)
        return
      }

      // 支付配置
      const settingsData = await settingsRes.json()
      if (settingsData.success && settingsData.data) {
        setPaymentProvider((settingsData.data.paymentProvider as PaymentProvider) || 'mock')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleMockPay = async () => {
    const token = localStorage.getItem('token')
    if (!token || !order) return
    const password = window.prompt('请输入 6 位支付密码')
    if (!password) return

    setPaying(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setPaySuccess(true)
        setTimeout(() => {
          router.push(`/dashboard/orders/${order.id}`)
        }, 2000)
      } else {
        setError(data.message || data.error || '支付失败')
      }
    } catch {
      setError('网络错误，支付请求失败')
    } finally {
      setPaying(false)
    }
  }

  // ---- 加载态 ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500">加载中...</span>
      </div>
    )
  }

  // ---- 错误态 ----
  if (error && !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => router.push('/dashboard/orders')}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          返回订单列表
        </button>
      </div>
    )
  }

  // ---- 支付成功态 ----
  if (paySuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">支付成功</h2>
          <p className="text-gray-500 mb-6">正在跳转到订单详情...</p>
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" />
        </div>
      </div>
    )
  }

  // ---- 主支付页面 ----
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/orders/${orderId}`)}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">确认支付</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* 订单信息 */}
        {order && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">订单编号</span>
              <span className="text-sm font-medium text-gray-900">{order.orderNo}</span>
            </div>

            {/* 商品列表 */}
            <div className="space-y-3 mb-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                    {item.product.imageUrl ? (
                      <Image
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <CreditCard className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-gray-400">x{item.quantity}</p>
                  </div>
                  <span className="text-sm text-gray-700">
                    ¥{formatMoney(item.totalPrice)}
                  </span>
                </div>
              ))}
            </div>

            {/* 金额明细 */}
            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              {order.pointsUsed > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">积分抵扣</span>
                  <span className="text-orange-600">-¥{formatMoney(order.pointsDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">商品总额</span>
                <span className="text-gray-700">¥{formatMoney(order.totalAmount)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="font-medium text-gray-900">实付金额</span>
                <span className="text-xl font-bold text-blue-600">
                  ¥{formatMoney(order.payAmount)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 支付方式 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">支付方式</h3>

          {paymentProvider === 'mock' ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-900">
                  {PROVIDER_LABELS[paymentProvider]}
                </p>
                <p className="text-xs text-blue-600">开发测试模式，点击即完成支付</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <Lock className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {PROVIDER_LABELS[paymentProvider]}
                </p>
                <p className="text-xs text-red-500">暂未开放，敬请期待</p>
              </div>
            </div>
          )}
        </div>

        {/* 安全提示 */}
        <div className="flex items-center gap-2 px-1">
          <Shield className="w-4 h-4 text-green-500" />
          <span className="text-xs text-gray-400">支付过程安全加密，请放心支付</span>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
        )}

        {/* 支付按钮 */}
        <button
          onClick={handleMockPay}
          disabled={paying || paymentProvider !== 'mock'}
          className={`w-full py-3.5 rounded-xl text-white font-semibold text-base transition-all ${
            paying
              ? 'bg-blue-400 cursor-not-allowed'
              : paymentProvider !== 'mock'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm'
          }`}
        >
          {paying ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              支付中...
            </span>
          ) : paymentProvider !== 'mock' ? (
            '暂未开放'
          ) : (
            `确认支付 ¥${order ? formatMoney(order.payAmount) : '0.00'}`
          )}
        </button>
      </div>
    </div>
  )
}