'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  ClipboardList, Search, Loader2, ChevronLeft, ChevronRight,
  X, Eye, Truck, Package, CheckCircle, XCircle, CreditCard
} from 'lucide-react'
import { hasPermission } from '@/lib/admin-permissions'

// ---- 类型定义 ----

interface OrderUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

interface OrderItemProduct {
  id: string
  name: string
  imageUrl: string | null
  retailPrice?: number
  memberPrice?: number
}

interface OrderItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  product: OrderItemProduct
}

interface OrderReward {
  id: string
  type: string
  amount: number
  status: string
  fromUserId: string | null
  level: number | null
}

interface Order {
  id: string
  userId: string
  orderNo: string
  totalAmount: number
  pointsUsed: number
  pointsDiscount: number
  payAmount: number
  status: string
  trackingNumber: string | null
  paidAt: string | null
  shippedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  user: OrderUser
  items: OrderItem[]
  rewards?: OrderReward[]
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ---- 状态映射 ----

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: '待支付', color: 'bg-yellow-50 text-yellow-700' },
  paid:      { label: '已支付', color: 'bg-blue-50 text-blue-700' },
  shipped:   { label: '已发货', color: 'bg-purple-50 text-purple-700' },
  completed: { label: '已完成', color: 'bg-green-50 text-green-700' },
  refunded:  { label: '已退款', color: 'bg-orange-50 text-orange-700' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-500' },
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'shipped', label: '已发货' },
  { value: 'completed', label: '已完成' },
  { value: 'refunded', label: '已退款' },
  { value: 'cancelled', label: '已取消' },
]

// ---- 主组件 ----

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  // v68:当前用户角色 + 权限检查
  const [userRole, setUserRole] = useState<string>('')
  // v68:操作权限
  const canApprove = hasPermission(userRole, 'approve')

  // 搜索与筛选
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 详情弹窗
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 发货弹窗
  const [shipOrderId, setShipOrderId] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [shipping, setShipping] = useState(false)

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    // v68:解析当前用户角色
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setUserRole(u.role || '')
    } catch {}
    if (storedToken) {
      setToken(storedToken)
      fetchOrders(storedToken, 1)
    }
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const fetchOrders = useCallback(async (authToken: string, page: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (search) params.set('search', search)
      if (filterStatus) params.set('status', filterStatus)

      const res = await fetch(`/api/admin/orders?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setOrders(data.data || [])
        setPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
      }
    } catch (error) {
      console.error('获取订单列表失败:', error)
      showMessage('error', '获取订单列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, filterStatus])

  const handleSearch = () => {
    if (token) fetchOrders(token, 1)
  }

  const handlePageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= pagination.totalPages) {
      fetchOrders(token, newPage)
    }
  }

  // 查看详情
  const handleViewDetail = async (orderId: string) => {
    if (!token) return
    setDetailLoading(true)
    setDetailOrder(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setDetailOrder(data.data)
      } else {
        showMessage('error', data.message || '获取订单详情失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setDetailLoading(false)
    }
  }

  // 通用状态更新（调用 PATCH /api/admin/orders/[id]/status）
  const updateOrderStatus = async (orderId: string, status: string, extra?: Record<string, string>) => {
    if (!token) return false
    try {
      const body: Record<string, unknown> = { status, ...extra }
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        return true
      } else {
        showMessage('error', data.error || '操作失败')
        return false
      }
    } catch {
      showMessage('error', '网络错误，请重试')
      return false
    }
  }

  // 状态操作按钮配置
  const STATUS_ACTIONS: Record<string, { label: string; status: string; icon: typeof CreditCard; color: string }[]> = {
    pending: [
      { label: '标记已支付', status: 'paid', icon: CreditCard, color: 'text-green-600 hover:bg-green-50' },
      { label: '取消订单', status: 'cancelled', icon: XCircle, color: 'text-red-600 hover:bg-red-50' },
    ],
    paid: [
      { label: '发货', status: 'shipped', icon: Truck, color: 'text-blue-600 hover:bg-blue-50' },
      { label: '取消订单', status: 'cancelled', icon: XCircle, color: 'text-red-600 hover:bg-red-50' },
    ],
    shipped: [
      { label: '完成订单', status: 'completed', icon: CheckCircle, color: 'text-green-600 hover:bg-green-50' },
    ],
  }

  // 点击操作按钮
  const handleStatusAction = async (orderId: string, action: { status: string; label: string }) => {
    // v68:发货属于审批类操作,需要 approve 权限
    if (action.status === 'shipped') {
      if (!canApprove) { showMessage('error', '您没有发货权限,请联系超级管理员'); return }
      // 发货需要输入物流单号,弹出对话框
      setShipOrderId(orderId)
      return
    }
    const ok = await updateOrderStatus(orderId, action.status)
    if (ok) {
      showMessage('success', `${action.label}成功`)
      fetchOrders(token!, pagination.page)
    }
  }

  // 发货
  const handleShip = async () => {
    if (!token || !shipOrderId) return
    if (!trackingNumber.trim()) {
      showMessage('error', '物流单号不能为空')
      return
    }
    setShipping(true)
    const ok = await updateOrderStatus(shipOrderId, 'shipped', { trackingNumber: trackingNumber.trim() })
    if (ok) {
      showMessage('success', '发货成功')
      setShipOrderId(null)
      setTrackingNumber('')
      fetchOrders(token, pagination.page)
    }
    setShipping(false)
  }

  // 格式化时间
  const formatTime = (iso: string | null) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // 渲染
  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">订单管理</h1>
      </div>

        {/* 消息提示 */}
        {message && (
          <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* 工具栏 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* 搜索框 */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索订单号/手机号/昵称..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 placeholder-gray-400
                  hover:border-gray-400"
              />
            </div>
            {/* 状态筛选 */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-colors text-gray-900 hover:border-gray-400"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {/* 搜索按钮 */}
            <button
              onClick={handleSearch}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                transition-colors font-medium whitespace-nowrap"
            >
              搜索
            </button>
          </div>
        </div>

        {/* 订单列表 */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ClipboardList className="w-12 h-12 mb-3" />
              <p>暂无订单数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单号</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">总金额</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">实付金额</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">支付时间</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">物流单号</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => {
                    const st = STATUS_MAP[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-500' }
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        {/* 订单号 */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-gray-900">{order.orderNo}</span>
                        </td>
                        {/* 用户 */}
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{order.user.phone}</div>
                          {order.user.nickname && (
                            <div className="text-xs text-gray-400">{order.user.nickname}</div>
                          )}
                        </td>
                        {/* 总金额 */}
                        <td className="px-4 py-3 text-gray-700">¥{order.totalAmount.toFixed(2)}</td>
                        {/* 实付金额 */}
                        <td className="px-4 py-3 text-blue-600 font-medium">¥{order.payAmount.toFixed(2)}</td>
                        {/* 状态 */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                        {/* 支付时间 */}
                        <td className="px-4 py-3 text-sm text-gray-500">{formatTime(order.paidAt)}</td>
                        {/* 物流单号 */}
                        <td className="px-4 py-3">
                          {order.trackingNumber ? (
                            <span className="text-xs font-mono text-gray-700">{order.trackingNumber}</span>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                        {/* 操作 */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <button
                              onClick={() => handleViewDetail(order.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-blue-600
                                hover:bg-blue-50 rounded-lg transition-colors font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              详情
                            </button>
                            {(STATUS_ACTIONS[order.status] || []).map(act => (
                              <button
                                key={act.status}
                                onClick={() => handleStatusAction(order.id, act)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-sm
                                  rounded-lg transition-colors font-medium ${act.color}`}
                              >
                                <act.icon className="w-3.5 h-3.5" />
                                {act.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {!loading && pagination.totalPages > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-500">
                共 {pagination.total} 个订单，第 {pagination.page}/{pagination.totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                    bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(p => {
                    if (pagination.totalPages <= 7) return true
                    return Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages
                  })
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1]
                    const showEllipsis = prev && p - prev > 1
                    return (
                      <span key={p} className="flex items-center">
                        {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                        <button
                          onClick={() => handlePageChange(p)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            p === pagination.page
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    )
                  })}
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                    bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      {/* 订单详情弹窗 */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailOrder(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* 标题 */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">订单详情</h2>
              <button
                onClick={() => setDetailOrder(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容 */}
            <div className="px-6 py-5 space-y-6">
              {/* 订单基本信息 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">订单信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-400">订单号</span>
                    <p className="text-sm font-mono text-gray-900">{detailOrder.orderNo}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">状态</span>
                    <p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_MAP[detailOrder.status]?.color || 'bg-gray-100 text-gray-500'
                      }`}>
                        {STATUS_MAP[detailOrder.status]?.label || detailOrder.status}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">总金额</span>
                    <p className="text-sm text-gray-900">¥{detailOrder.totalAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">实付金额</span>
                    <p className="text-sm text-blue-600 font-medium">¥{detailOrder.payAmount.toFixed(2)}</p>
                  </div>
                  {detailOrder.pointsUsed > 0 && (
                    <>
                      <div>
                        <span className="text-xs text-gray-400">使用积分</span>
                        <p className="text-sm text-gray-900">{detailOrder.pointsUsed}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">积分抵扣</span>
                        <p className="text-sm text-gray-900">¥{detailOrder.pointsDiscount.toFixed(2)}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-xs text-gray-400">创建时间</span>
                    <p className="text-sm text-gray-900">{formatTime(detailOrder.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">支付时间</span>
                    <p className="text-sm text-gray-900">{formatTime(detailOrder.paidAt)}</p>
                  </div>
                  {detailOrder.shippedAt && (
                    <div>
                      <span className="text-xs text-gray-400">发货时间</span>
                      <p className="text-sm text-gray-900">{formatTime(detailOrder.shippedAt)}</p>
                    </div>
                  )}
                  {detailOrder.trackingNumber && (
                    <div>
                      <span className="text-xs text-gray-400">物流单号</span>
                      <p className="text-sm font-mono text-gray-900">{detailOrder.trackingNumber}</p>
                    </div>
                  )}
                  {detailOrder.completedAt && (
                    <div>
                      <span className="text-xs text-gray-400">完成时间</span>
                      <p className="text-sm text-gray-900">{formatTime(detailOrder.completedAt)}</p>
                    </div>
                  )}
                  {detailOrder.cancelledAt && (
                    <div>
                      <span className="text-xs text-gray-400">取消时间</span>
                      <p className="text-sm text-gray-900">{formatTime(detailOrder.cancelledAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 用户信息 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">用户信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-400">手机号</span>
                    <p className="text-sm text-gray-900">{detailOrder.user.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">昵称</span>
                    <p className="text-sm text-gray-900">{detailOrder.user.nickname || '-'}</p>
                  </div>
                </div>
              </div>

              {/* 商品列表 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">商品列表</h3>
                <div className="space-y-3">
                  {detailOrder.items.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg bg-gray-50">
                      {/* 商品图片 */}
                      {item.product.imageUrl ? (
                        <div className="w-14 h-14 rounded-lg relative overflow-hidden border border-gray-200 flex-shrink-0">
                          <Image
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      {/* 商品信息 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">单价 ¥{item.unitPrice.toFixed(2)}</p>
                      </div>
                      {/* 数量和金额 */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">x{item.quantity}</p>
                        <p className="text-sm font-medium text-gray-900">¥{item.totalPrice.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 奖励记录 */}
              {detailOrder.rewards && detailOrder.rewards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">奖励记录</h3>
                  <div className="space-y-2">
                    {detailOrder.rewards.map(r => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 border border-gray-100 rounded-lg bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.type === 'referral' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                          }`}>
                            {r.type === 'referral' ? '推荐奖' : r.type === 'brand_bonus' ? '品牌奖' : r.type}
                          </span>
                          {r.level != null && (
                            <span className="text-xs text-gray-400">第{r.level}层</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-900">+¥{r.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-2xl">
              {(STATUS_ACTIONS[detailOrder.status] || []).map(act => (
                <button
                  key={act.status}
                  onClick={() => {
                    if (act.status === 'shipped') {
                      setShipOrderId(detailOrder.id)
                    } else {
                      updateOrderStatus(detailOrder.id, act.status).then(ok => {
                        if (ok) {
                          showMessage('success', `${act.label}成功`)
                          handleViewDetail(detailOrder.id)
                          fetchOrders(token!, pagination.page)
                        }
                      })
                    }
                  }}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium shadow-sm text-white ${
                    act.status === 'cancelled'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  } transition-colors`}
                >
                  <act.icon className="w-4 h-4" />
                  {act.label}
                </button>
              ))}
              <button
                onClick={() => setDetailOrder(null)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 加载中遮罩（详情） */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-gray-600">加载中...</span>
          </div>
        </div>
      )}

      {/* 发货弹窗 */}
      {shipOrderId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShipOrderId(null); setTrackingNumber('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">标记发货</h3>
            <p className="text-sm text-gray-500 mb-4">请输入物流单号以确认发货</p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                物流单号 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleShip()}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="请输入物流单号"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShipOrderId(null); setTrackingNumber('') }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleShip}
                disabled={shipping}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    shipping
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
                  }`}
              >
                {shipping && <Loader2 className="w-4 h-4 animate-spin" />}
                确认发货
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}