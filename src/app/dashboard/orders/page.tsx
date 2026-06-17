'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag, Package, CreditCard, Truck, CheckCircle2,
  XCircle, RotateCcw, ChevronLeft, ChevronRight, ArrowLeft,
  ImageOff
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import { formatMoney } from '@/lib/utils/format'

// ---- 类型 ----

interface OrderItem {
  id: string
  productId: string
  productName: string
  productImage?: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface Order {
  id: string
  orderNo: string
  totalAmount: number
  payAmount: number
  pointsUsed: number
  status: string
  createdAt: string
  items: OrderItem[]
}

// ---- 状态配置 ----

type StatusKey = 'all' | 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded'

const STATUS_TABS: { key: StatusKey; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <ShoppingBag className="w-4 h-4" /> },
  { key: 'pending', label: '待支付', icon: <CreditCard className="w-4 h-4" /> },
  { key: 'paid', label: '已支付', icon: <Package className="w-4 h-4" /> },
  { key: 'shipped', label: '已发货', icon: <Truck className="w-4 h-4" /> },
  { key: 'completed', label: '已完成', icon: <CheckCircle2 className="w-4 h-4" /> },
  { key: 'refunded', label: '已退款', icon: <RotateCcw className="w-4 h-4" /> },
  { key: 'cancelled', label: '已取消', icon: <XCircle className="w-4 h-4" /> },
]

const STATUS_BADGE: Record<string, { text: string; color: string }> = {
  pending:  { text: '待支付', color: 'bg-yellow-100 text-yellow-700' },
  paid:     { text: '已支付', color: 'bg-blue-100 text-blue-700' },
  shipped:  { text: '已发货', color: 'bg-purple-100 text-purple-700' },
  completed:{ text: '已完成', color: 'bg-green-100 text-green-700' },
  cancelled:{ text: '已取消', color: 'bg-gray-100 text-gray-500' },
  refunded: { text: '已退款', color: 'bg-red-100 text-red-700' },
}

// ---- 主组件 ----

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<StatusKey>('all')
  const [page, setPage] = useState(1)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const pageSize = 8

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchOrders(storedToken)
  }, [router])

  const fetchOrders = async (authToken: string) => {
    try {
      const res = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        // v43-1 修复：data.data 是 {orders, pagination} 对象，orders 才是数组
        setOrders(data.data?.orders || [])
      }
    } catch (err) {
      console.error('获取订单列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 支付
  const handlePay = async (orderId: string) => {
    if (!token) return
    setActionLoading(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        await fetchOrders(token)
      } else {
        const err = await res.json()
        toast.error(err.error || '支付失败')
      }
    } catch {
      toast.error('支付请求失败')
    } finally {
      setActionLoading(null)
    }
  }

  // 确认收货
  const handleConfirm = async (orderId: string) => {
    if (!token) return
    setActionLoading(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        await fetchOrders(token)
      } else {
        const err = await res.json()
        toast.error(err.error || '确认收货失败')
      }
    } catch {
      toast.error('确认收货请求失败')
    } finally {
      setActionLoading(null)
    }
  }

  // 筛选 + 分页
  const filtered = activeTab === 'all' ? orders : orders.filter((o) => o.status === activeTab)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  // 切换 tab 重置页码
  const handleTabChange = (tab: StatusKey) => {
    setActiveTab(tab)
    setPage(1)
  }

  const formatDate = (s: string) => {
    const d = new Date(s)
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // ---- 加载态 ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 w-20 bg-gray-200 rounded-full animate-pulse" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-base p-5 animate-pulse">
                <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
                <div className="flex gap-4">
                  <div className="w-16 h-16 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-200 rounded" />
                    <div className="h-4 w-1/4 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 返回 + 标题 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-primary hover:shadow-md transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            我的订单
          </h1>
          <span className="text-sm text-gray-400 ml-1">共 {filtered.length} 条</span>
        </div>

        {/* 状态筛选栏 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 订单列表 */}
        {paged.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {paged.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onPay={handlePay}
                onConfirm={handleConfirm}
                actionLoading={actionLoading}
                formatDate={formatDate}
                formatMoney={formatMoney}
              />
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-primary hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                  p === page
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'bg-white text-gray-600 hover:text-primary shadow-sm'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-primary hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>

    </div>
  )
}

// ---- 订单卡片 ----

function OrderCard({
  order,
  onPay,
  onConfirm,
  actionLoading,
  formatDate,
  formatMoney,
}: {
  order: Order
  onPay: (id: string) => void
  onConfirm: (id: string) => void
  actionLoading: string | null
  formatDate: (s: string) => string
  formatMoney: (n: number) => string
}) {
  const badge = STATUS_BADGE[order.status] || { text: order.status, color: 'bg-gray-100 text-gray-500' }
  const item = order.items[0] // 一单一品

  return (
    <div className="card-base overflow-hidden group">
      {/* 卡片头部 */}
      <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-mono text-sm text-gray-500">{order.orderNo}</span>
        <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
        <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
          {badge.text}
        </span>
      </div>

      {/* 卡片内容 - 可点击跳转 */}
      <Link href={`/dashboard/orders/${order.id}`} className="block px-5 py-4 hover:bg-primary-50/30 transition-colors">
        <div className="flex gap-4">
          {/* 商品图片 */}
          <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden relative flex items-center justify-center">
            {item?.productImage ? (
              <Image src={item.productImage} alt={item.productName} fill className="object-cover" />
            ) : (
              <ImageOff className="w-6 h-6 text-gray-300" />
            )}
          </div>

          {/* 商品信息 */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{item?.productName || '商品'}</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              单价 ¥{item ? formatMoney(item.unitPrice) : '0.00'} &times; {item?.quantity || 1}
            </p>
          </div>

          {/* 实付金额 */}
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400">实付金额</p>
            <p className="text-lg font-bold text-primary">¥{formatMoney(order.payAmount)}</p>
            {order.pointsUsed > 0 && (
              <p className="text-xs text-secondary">含积分抵扣 {order.pointsUsed}</p>
            )}
          </div>
        </div>
      </Link>

      {/* 卡片底部 - 操作按钮 */}
      {(order.status === 'pending' || order.status === 'shipped') && (
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
          <Link
            href={`/dashboard/orders/${order.id}`}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            查看详情
          </Link>
          {order.status === 'pending' && (
            <button
              onClick={(e) => { e.preventDefault(); onPay(order.id) }}
              disabled={actionLoading === order.id}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors shadow-sm"
            >
              {actionLoading === order.id ? '支付中...' : '去支付'}
            </button>
          )}
          {order.status === 'shipped' && (
            <button
              onClick={(e) => { e.preventDefault(); onConfirm(order.id) }}
              disabled={actionLoading === order.id}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 disabled:opacity-50 transition-colors shadow-sm"
            >
              {actionLoading === order.id ? '处理中...' : '确认收货'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---- 空状态 ----

function EmptyState() {
  return (
    <div className="card-base p-16 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Package className="w-10 h-10 text-gray-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-500 mb-2">暂无订单</h3>
      <p className="text-sm text-gray-400 mb-6">快去挑选心仪的健康产品吧</p>
      <Link
        href="/products"
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-600 transition-colors shadow-md shadow-primary/25"
      >
        <ShoppingBag className="w-4 h-4" />
        去购物
      </Link>
    </div>
  )
}