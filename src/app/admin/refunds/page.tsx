'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  Receipt, Search, Loader2, ChevronLeft, ChevronRight,
  X, CheckCircle, XCircle, Eye, CreditCard
} from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import { hasPermission } from '@/lib/admin-permissions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import RefundApplicationHistory, {
  buildRefundAttemptView,
  type RefundHistoryRecord,
} from '@/components/admin/refunds/RefundApplicationHistory'

// v68:大额退款阈值,超过需要二次确认
const LARGE_REFUND_THRESHOLD = 1000

// ---- 类型定义 ----

interface RefundUser {
  id: string
  phone: string
  nickname: string | null
}

interface RefundOrder {
  id: string
  orderNo: string
  payAmount: number
}

interface RefundItem {
  id: string
  orderId: string
  userId: string
  amount: number
  reason: string
  description: string | null
  images: unknown
  status: string
  adminComment: string | null
  createdAt: string
  updatedAt: string
  user: RefundUser
  order: RefundOrder
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ---- 映射 ----

const REFUND_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  approved:  { label: '已通过', color: 'bg-blue-50 text-blue-700' },
  rejected:  { label: '已拒绝', color: 'bg-red-50 text-red-700' },
  completed: { label: '已完成', color: 'bg-green-50 text-green-700' },
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'completed', label: '已完成' },
]

// ---- 主组件 ----

export default function AdminRefundsPage() {
  const [token, setToken] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')  // v68:当前用户角色
  const [refunds, setRefunds] = useState<RefundItem[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  // 审核弹窗
  const [reviewModal, setReviewModal] = useState<{
    item: RefundItem
    action: 'approve' | 'reject'
  } | null>(null)
  const [adminComment, setAdminComment] = useState('')
  const [reviewing, setReviewing] = useState(false)
  // v68:大额退款二次确认
  const [largeRefundConfirm, setLargeRefundConfirm] = useState<{ item: RefundItem; action: 'approve' | 'reject' } | null>(null)

  // 历次申请
  const [reviewHistory, setReviewHistory] = useState<RefundHistoryRecord[]>([])
  const [reviewHistoryLoading, setReviewHistoryLoading] = useState(false)
  const [reviewHistoryError, setReviewHistoryError] = useState('')
  const reviewHistoryRequestRef = useRef(0)

  // v68:操作权限
  const canApprove = hasPermission(userRole, 'approve')

  // 确认退款弹窗
  const [completeModal, setCompleteModal] = useState<RefundItem | null>(null)
  const [completing, setCompleting] = useState(false)

  // 详情弹窗
  const [detailModal, setDetailModal] = useState<RefundItem | null>(null)

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      fetchRefunds(storedToken, 1)
    }
    // v68:解析当前用户角色
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setUserRole(u.role || '')
    } catch {}
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const closeReviewModal = () => {
    reviewHistoryRequestRef.current += 1
    setReviewModal(null)
    setAdminComment('')
    setReviewHistory([])
    setReviewHistoryError('')
    setReviewHistoryLoading(false)
  }

  const fetchReviewHistory = async (item: RefundItem, authToken: string) => {
    const requestId = reviewHistoryRequestRef.current + 1
    reviewHistoryRequestRef.current = requestId
    setReviewHistoryLoading(true)
    setReviewHistoryError('')
    setReviewHistory([])
    try {
      const res = await fetch(`/api/orders/${item.orderId}/refund`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (!res.ok || !data.success || !Array.isArray(data.data)) {
        throw new Error(data.error || '历史申请加载失败')
      }
      const records = data.data as RefundHistoryRecord[]
      if (!records.some(record => record.id === item.id)) {
        throw new Error('历史申请数据不完整')
      }
      if (reviewHistoryRequestRef.current !== requestId) return
      setReviewHistory(records)
    } catch (error) {
      if (reviewHistoryRequestRef.current !== requestId) return
      setReviewHistoryError(error instanceof Error ? error.message : '历史申请加载失败')
    } finally {
      if (reviewHistoryRequestRef.current === requestId) {
        setReviewHistoryLoading(false)
      }
    }
  }

  const openReviewModal = (item: RefundItem, action: 'approve' | 'reject') => {
    if (!token) return
    setReviewModal({ item, action })
    setAdminComment('')
    void fetchReviewHistory(item, token)
  }

  // ---- 列表 API ----

  const fetchRefunds = useCallback(async (authToken: string, page: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/admin/refunds?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setRefunds(data.data || [])
        setPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
      }
    } catch (error) {
      console.error('获取退款列表失败:', error)
      showMessage('error', '获取退款列表失败')
    } finally {
      setLoading(false)
    }
  }, [search, status])

  // ---- 审核操作 ----

  const handleReview = async () => {
    if (!token || !reviewModal) return
    if (reviewHistoryLoading || reviewHistoryError) {
      showMessage('error', '请先成功加载完整历史申请')
      return
    }
    if (reviewModal.action === 'reject' && adminComment.trim().length < 5) {
      showMessage('error', '拒绝原因至少填写5个字符')
      return
    }
    setReviewing(true)
    try {
      const res = await fetch(`/api/admin/refunds/${reviewModal.item.id}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: reviewModal.action,
          adminComment: adminComment.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', reviewModal.action === 'approve' ? '退款申请已通过' : '退款申请已拒绝')
        closeReviewModal()
        fetchRefunds(token, pagination.page)
      } else {
        showMessage('error', data.message || '操作失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setReviewing(false)
    }
  }

  // ---- 确认退款操作 ----

  const handleComplete = async () => {
    if (!token || !completeModal) return
    setCompleting(true)
    try {
      const res = await fetch(`/api/admin/refunds/${completeModal.id}/complete`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '退款已完成')
        setCompleteModal(null)
        fetchRefunds(token, pagination.page)
      } else {
        showMessage('error', data.message || '操作失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setCompleting(false)
    }
  }

  // ---- 搜索与分页 ----

  const handleSearch = () => {
    if (token) fetchRefunds(token, 1)
  }

  const handlePageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= pagination.totalPages) {
      fetchRefunds(token, newPage)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // 解析 images 字段
  const parseImages = (images: unknown): string[] => {
    if (Array.isArray(images)) return images as string[]
    return []
  }

  // ---- 渲染 ----
  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Receipt className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">退款管理</h1>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
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
                transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-colors text-gray-900 hover:border-gray-400"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
              transition-colors font-medium whitespace-nowrap"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        ) : refunds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Receipt className="w-12 h-12 mb-3" />
            <p>暂无退款申请</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单号</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">退款金额</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">原因</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">管理员备注</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">申请时间</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refunds.map(r => {
                  const statusInfo = REFUND_STATUS_MAP[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-500' }
                  const images = parseImages(r.images)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">{r.order?.orderNo || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{r.user?.nickname || '-'}</div>
                        <div className="text-xs text-gray-400">{r.user?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-orange-600">¥{formatMoney(r.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 max-w-[150px] truncate">{r.reason}</div>
                        {r.description && (
                          <div className="text-xs text-gray-400 max-w-[150px] truncate">{r.description}</div>
                        )}
                        {images.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {images.slice(0, 3).map((img, idx) => (
                              <a key={idx} href={img as string} target="_blank" rel="noopener noreferrer">
                                <div className="relative w-8 h-8">
                                  <Image
                                    src={img as string}
                                    alt=""
                                    fill
                                    className="object-cover rounded border border-gray-200"
                                  />
                                </div>
                              </a>
                            ))}
                            {images.length > 3 && (
                              <span className="text-xs text-gray-400 self-center">+{images.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate">{r.adminComment || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatTime(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDetailModal(r)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {r.status === 'pending' && (
                            <>
                              <button
                                onClick={() => {
                                  if (!canApprove) { showMessage('error', '您没有审批权限,请联系超级管理员'); return }
                                  if (r.amount >= LARGE_REFUND_THRESHOLD) {
                                    setLargeRefundConfirm({ item: r, action: 'approve' })
                                  } else {
                                    openReviewModal(r, 'approve')
                                  }
                                }}
                                disabled={!canApprove}
                                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                title={!canApprove ? '无审批权限' : '通过退款'}
                              >
                                通过
                              </button>
                              <button
                                onClick={() => {
                                  if (!canApprove) { showMessage('error', '您没有审批权限,请联系超级管理员'); return }
                                  openReviewModal(r, 'reject')
                                }}
                                disabled={!canApprove}
                                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                title={!canApprove ? '无审批权限' : '拒绝退款'}
                              >
                                拒绝
                              </button>
                            </>
                          )}
                          {r.status === 'approved' && (
                            <button
                              onClick={() => setCompleteModal(r)}
                              className="text-xs px-2.5 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors font-medium flex items-center gap-1"
                            >
                              <CreditCard className="w-3 h-3" />
                              确认退款
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">
            第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---- 审核弹窗 ---- */}
      {reviewModal && (() => {
        const attemptView = buildRefundAttemptView(reviewHistory, reviewModal.item.id)
        const rejectionReasonInvalid = reviewModal.action === 'reject'
          && adminComment.trim().length < 5
        const reviewUnavailable = reviewHistoryLoading || Boolean(reviewHistoryError)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">
                  {reviewModal.action === 'approve' ? '通过退款申请' : '拒绝退款申请'}
                </h3>
                <button onClick={closeReviewModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div className="text-sm text-gray-500">
                  第 {attemptView.currentAttemptNumber} 次申请
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">订单号：</span>
                  <span className="text-gray-900 font-mono">{reviewModal.item.order?.orderNo}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">用户：</span>
                  <span className="text-gray-900">{reviewModal.item.user?.nickname || '-'} ({reviewModal.item.user?.phone})</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">退款金额：</span>
                  <span className="text-orange-600 font-medium">¥{formatMoney(reviewModal.item.amount)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">退款原因：</span>
                  <span className="text-gray-900">{reviewModal.item.reason}</span>
                </div>
                {reviewModal.item.description && (
                  <div className="text-sm">
                    <span className="text-gray-500">补充说明：</span>
                    <span className="text-gray-700">{reviewModal.item.description}</span>
                  </div>
                )}
                {parseImages(reviewModal.item.images).length > 0 && (
                  <div className="text-sm">
                    <span className="text-gray-500 block mb-2">凭证图片：</span>
                    <div className="flex flex-wrap gap-2">
                      {parseImages(reviewModal.item.images).map((img, idx) => (
                        <a key={idx} href={img as string} target="_blank" rel="noopener noreferrer">
                          <div className="relative w-16 h-16">
                            <Image
                              src={img as string}
                              alt=""
                              fill
                              className="object-cover rounded-lg border border-gray-200"
                            />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {reviewHistoryLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在加载历史申请
                  </div>
                )}

                {reviewHistoryError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <p>{reviewHistoryError}</p>
                    <button type="button" onClick={() => token && fetchReviewHistory(reviewModal.item, token)} className="mt-1 underline">
                      重新获取
                    </button>
                  </div>
                )}

                {!reviewHistoryLoading && !reviewHistoryError && (
                  <RefundApplicationHistory
                    records={reviewHistory}
                    currentRefundId={reviewModal.item.id}
                    formatTime={formatTime}
                  />
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {reviewModal.action === 'reject' ? '拒绝原因（至少 5 个字符）' : '管理员备注'}
                  </label>
                  <textarea
                    value={adminComment}
                    onChange={e => setAdminComment(e.target.value)}
                    rows={3}
                    placeholder={reviewModal.action === 'reject' ? '填写拒绝原因（至少5个字符）...' : '填写审核备注（可选）...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      text-sm text-gray-900 placeholder-gray-400 resize-none"
                  />
                  {rejectionReasonInvalid && adminComment.length > 0 && (
                    <p className="text-xs text-red-500 mt-1">拒绝原因至少填写5个字符</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={closeReviewModal}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700
                    hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleReview}
                  disabled={reviewing || reviewUnavailable || rejectionReasonInvalid}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-white font-medium text-sm
                    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                    ${reviewModal.action === 'approve'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-red-600 hover:bg-red-700'
                    }`}
                >
                  {reviewing ? '处理中...' : reviewModal.action === 'approve' ? '确认通过' : '确认拒绝'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ---- 确认退款弹窗 ---- */}
      {completeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">确认退款</h3>
              <button onClick={() => setCompleteModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600">
                确认对订单 <span className="font-mono font-medium text-gray-900">{completeModal.order?.orderNo}</span> 执行退款？
              </p>
              <p className="text-sm">
                <span className="text-gray-500">退款金额：</span>
                <span className="text-orange-600 font-semibold">¥{formatMoney(completeModal.amount)}</span>
              </p>
              <p className="text-xs text-gray-400">确认后将执行退款，金额将退回用户余额。</p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setCompleteModal(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700
                  hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                取消
              </button>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium text-sm
                  hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                {completing ? '处理中...' : '确认退款'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 详情弹窗 ---- */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">退款申请详情</h3>
              <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {(() => {
                const sInfo = REFUND_STATUS_MAP[detailModal.status] || { label: detailModal.status, color: 'bg-gray-100 text-gray-500' }
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sInfo.color}`}>
                        {sInfo.label}
                      </span>
                      <span className="text-xs text-gray-400">{formatTime(detailModal.createdAt)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-gray-500">订单号：</span><span className="font-mono text-gray-900">{detailModal.order?.orderNo}</span></div>
                      <div><span className="text-gray-500">退款金额：</span><span className="text-orange-600 font-medium">¥{formatMoney(detailModal.amount)}</span></div>
                      <div><span className="text-gray-500">用户昵称：</span><span className="text-gray-900">{detailModal.user?.nickname || '-'}</span></div>
                      <div><span className="text-gray-500">手机号：</span><span className="text-gray-900">{detailModal.user?.phone}</span></div>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">退款原因：</span>
                      <span className="text-gray-900">{detailModal.reason}</span>
                    </div>
                    {detailModal.description && (
                      <div className="text-sm">
                        <span className="text-gray-500">补充说明：</span>
                        <span className="text-gray-700">{detailModal.description}</span>
                      </div>
                    )}
                    {parseImages(detailModal.images).length > 0 && (
                      <div>
                        <span className="text-sm text-gray-500 block mb-2">凭证图片：</span>
                        <div className="flex flex-wrap gap-2">
                          {parseImages(detailModal.images).map((img, idx) => (
                            <a key={idx} href={img as string} target="_blank" rel="noopener noreferrer"
                              className="block">
                              <div className="relative w-20 h-20">
                                <Image
                                  src={img as string}
                                  alt=""
                                  fill
                                  className="object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
                                />
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailModal.adminComment && (
                      <div className="bg-gray-50 rounded-lg p-3 text-sm">
                        <span className="text-gray-500">管理员备注：</span>
                        <span className="text-gray-700">{detailModal.adminComment}</span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setDetailModal(null)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700
                  hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v68:大额退款二次确认 */}
      <ConfirmDialog
        open={!!largeRefundConfirm}
        title="大额退款确认"
        mode="emphasize"
        confirmText="我已确认,执行"
        cancelText="取消"
        loading={reviewing}
        onConfirm={async () => {
          if (!largeRefundConfirm) return
          setReviewing(true)
          try {
            const item = largeRefundConfirm.item
            openReviewModal(item, largeRefundConfirm.action)
            setLargeRefundConfirm(null)
            // 注意:ConfirmDialog 关闭后,reviewModal 接管审核流程
            // 实际提交由 reviewModal 的"确认通过"按钮触发
          } finally {
            setReviewing(false)
          }
        }}
        onCancel={() => setLargeRefundConfirm(null)}
        message={
          largeRefundConfirm && (
            <div className="space-y-2">
              <p>这是一笔 <b className="text-red-600">¥{formatMoney(largeRefundConfirm.item.amount)}</b> 的大额退款,超过 ¥{LARGE_REFUND_THRESHOLD} 阈值。</p>
              <p>请确认:</p>
              <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                <li>退款原因: <b>{largeRefundConfirm.item.reason}</b></li>
                <li>用户: {largeRefundConfirm.item.user.phone}</li>
                <li>订单: {largeRefundConfirm.item.order.orderNo}</li>
              </ul>
              <p className="text-red-600 font-medium pt-2">⚠️ 此操作不可撤销,确认无误后再点确认。</p>
            </div>
          )
        }
      />
    </>
  )
}