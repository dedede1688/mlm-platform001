'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft, Package, CreditCard, Truck, CheckCircle2,
  XCircle, Clock, ImageOff, Loader2, RotateCcw, AlertTriangle
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
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
  trackingNumber: string | null
  paidAt: string | null
  shippedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  items: OrderItem[]
  refundRequests: RefundRequest[]
}

interface RefundRequest {
  id: string
  reason: string
  description: string | null
  images: string[] | null
  status: string
  adminComment: string | null
  createdAt: string
}

// ---- 状态配置 ----

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending:   { label: '待支付', color: 'text-yellow-600', icon: Clock },
  paid:      { label: '已支付', color: 'text-blue-600', icon: CreditCard },
  shipped:   { label: '已发货', color: 'text-purple-600', icon: Truck },
  completed: { label: '已完成', color: 'text-green-600', icon: CheckCircle2 },
  cancelled: { label: '已取消', color: 'text-gray-500', icon: XCircle },
  refunded:  { label: '已退款', color: 'text-orange-600', icon: RotateCcw },
}

const REFUND_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending:   { label: '待审核', color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200' },
  approved:  { label: '已通过', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
  rejected:  { label: '已拒绝', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
  completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
}

// ---- 工具函数 ----

const formatTime = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ---- 主组件 ----

export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRefundSuccess, setShowRefundSuccess] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    fetchOrder(storedToken)
  }, [router])

  const fetchOrder = async (authToken: string) => {
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 401) {
        router.push('/login')
        return
      }
      const data = await res.json()
      if (data.success) {
        setOrder(data.data)
        // 检测退款申请成功提示
        if (searchParams.get('refund') === 'success') {
          setShowRefundSuccess(true)
          setTimeout(() => setShowRefundSuccess(false), 3000)
        }
      } else {
        toast.error(data.error || '获取订单失败')
        router.push('/dashboard/orders')
      }
    } catch {
      toast.error('网络错误')
      router.push('/dashboard/orders')
    } finally {
      setLoading(false)
    }
  }

  const handlePay = async () => {
    if (!order) return
    router.push(`/payment/order/${order.id}`)
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

  if (!order) return null

  const statusCfg = STATUS_CONFIG[order.status] || { label: order.status, color: 'text-gray-500', icon: Clock }
  const StatusIcon = statusCfg.icon

  // 构建时间线节点
  const timeline: { label: string; time: string | null; icon: typeof Clock; active: boolean }[] = [
    { label: '下单成功', time: order.createdAt, icon: Package, active: true },
    { label: '支付成功', time: order.paidAt, icon: CreditCard, active: !!order.paidAt },
    { label: '已发货', time: order.shippedAt, icon: Truck, active: !!order.shippedAt },
    { label: '已完成', time: order.completedAt, icon: CheckCircle2, active: !!order.completedAt },
  ]
  if (order.cancelledAt) {
    timeline.push({ label: '已取消', time: order.cancelledAt, icon: XCircle, active: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/orders')}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">订单详情</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
        {/* 订单状态卡片 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <StatusIcon className={`w-5 h-5 ${statusCfg.color}`} />
              <span className={`text-lg font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
            </div>
            <span className="text-xs text-gray-400 font-mono">{order.orderNo}</span>
          </div>

          {/* 步骤条时间线 */}
          {!order.cancelledAt && (
            <div className="flex items-center justify-between relative">
              {timeline.slice(0, 4).map((step, idx) => {
                const StepIcon = step.icon
                const isLast = idx === 3
                return (
                  <div key={step.label} className="flex flex-col items-center relative z-10 flex-1">
                    {/* 连接线 */}
                    {!isLast && (
                      <div className={`absolute top-3.5 left-1/2 w-full h-0.5 ${
                        timeline[idx + 1]?.active ? 'bg-blue-500' : 'bg-gray-200'
                      }`} />
                    )}
                    {/* 圆形图标 */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      step.active
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <StepIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className={`text-xs mt-1.5 font-medium ${
                      step.active ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                    {step.time && (
                      <span className="text-[10px] text-gray-400 mt-0.5">{formatTime(step.time)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 取消时间线（单独显示） */}
          {order.cancelledAt && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-gray-500">
                <XCircle className="w-4 h-4" />
                <span className="text-sm">订单于 {formatTime(order.cancelledAt)} 已取消</span>
              </div>
            </div>
          )}
        </div>

        {/* 物流信息 */}
        {order.trackingNumber && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-gray-900">物流信息</span>
            </div>
            <div className="flex items-center gap-3 bg-purple-50 rounded-lg px-4 py-3">
              <span className="text-xs text-purple-500 font-medium">物流单号</span>
              <span className="text-sm font-mono text-purple-700 font-medium">{order.trackingNumber}</span>
            </div>
            {order.shippedAt && (
              <p className="text-xs text-gray-400 mt-2">发货时间：{formatTime(order.shippedAt)}</p>
            )}
          </div>
        )}

        {/* 商品列表 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">商品清单</h3>
          <div className="space-y-3">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                {/* 商品图片 */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {item.product.imageUrl ? (
                    <Image
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                </div>
                {/* 商品信息 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">单价 ¥{formatMoney(item.unitPrice)}</p>
                </div>
                {/* 数量和金额 */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">x{item.quantity}</p>
                  <p className="text-sm font-medium text-gray-900">¥{formatMoney(item.totalPrice)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 金额信息 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">金额明细</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">商品总额</span>
              <span className="text-gray-900">¥{formatMoney(order.totalAmount)}</span>
            </div>
            {order.pointsUsed > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">积分抵扣（{order.pointsUsed} 积分）</span>
                <span className="text-orange-600">-¥{formatMoney(order.pointsDiscount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-900 font-medium">实付金额</span>
              <span className="text-blue-600 text-lg font-semibold">¥{formatMoney(order.payAmount)}</span>
            </div>
          </div>
        </div>

        {/* 退款申请成功提示 */}
        {showRefundSuccess && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">退款申请已提交，请耐心等待审核</span>
          </div>
        )}

        {/* 退款申请状态卡片 */}
        {order.refundRequests && order.refundRequests.length > 0 && (() => {
          const latestRefund = order.refundRequests[0]
          const refundCfg = REFUND_STATUS_CONFIG[latestRefund.status] || {
            label: latestRefund.status, color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200',
          }
          return (
            <div className={`rounded-xl shadow-sm p-5 border ${refundCfg.bgColor}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <RotateCcw className={`w-4 h-4 ${refundCfg.color}`} />
                  <span className={`text-sm font-semibold ${refundCfg.color}`}>
                    退款申请：{refundCfg.label}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{formatTime(latestRefund.createdAt)}</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">退款原因：</span>
                  <span className="text-gray-900">{latestRefund.reason}</span>
                </div>
                {latestRefund.description && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0">补充说明：</span>
                    <span className="text-gray-700">{latestRefund.description}</span>
                  </div>
                )}
                {latestRefund.adminComment && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0">管理员备注：</span>
                    <span className="text-gray-700">{latestRefund.adminComment}</span>
                  </div>
                )}
                {latestRefund.images && Array.isArray(latestRefund.images) && (latestRefund.images as string[]).length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 flex-shrink-0">凭证图片：</span>
                    <div className="flex flex-wrap gap-2">
                      {(latestRefund.images as string[]).map((img: string, idx: number) => (
                        <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                          <div className="relative w-12 h-12">
                            <Image
                              src={img}
                              alt={`凭证${idx + 1}`}
                              fill
                              className="object-cover rounded border border-gray-200"
                            />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {latestRefund.status === 'pending' && (
                <div className="mt-3 pt-3 border-t border-gray-200/50">
                  <div className="flex items-center gap-1.5 text-xs text-yellow-600">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>退款申请审核中，请耐心等待</span>
                  </div>
                </div>
              )}
              {latestRefund.status === 'rejected' && (
                <div className="mt-3 pt-3 border-t border-gray-200/50">
                  <button
                    onClick={() => router.push(`/dashboard/orders/${order.id}/refund`)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    重新申请退款
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* 操作按钮 */}
        {order.status === 'pending' && (
          <button
            onClick={handlePay}
            className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all
              bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm"
          >
            去支付
          </button>
        )}
        {(order.status === 'paid' || order.status === 'shipped') && (
          (() => {
            const hasPendingRefund = order.refundRequests?.some(r => r.status === 'pending')
            return hasPendingRefund ? (
              <div className="w-full py-3 rounded-xl text-gray-400 font-medium text-base text-center
                bg-gray-100 cursor-not-allowed">
                退款申请审核中
              </div>
            ) : (
              <button
                onClick={() => router.push(`/dashboard/orders/${order.id}/refund`)}
                className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all
                  bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-sm
                  flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                申请退款
              </button>
            )
          })()
        )}
      </div>
    </div>
  )
}