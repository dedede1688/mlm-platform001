'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Wallet, Search, Loader2, ChevronLeft, ChevronRight,
  X, CheckCircle, XCircle, DollarSign, Gift,
  ListChecks, FileText, History, Bell, SquareCheck, Square
} from 'lucide-react'
import { hasPermission } from '@/lib/admin-permissions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

// v68:大额提现阈值
const LARGE_WITHDRAWAL_THRESHOLD = 5000

// ---- 类型定义 ----

interface RewardUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

interface RewardItem {
  id: string
  userId: string
  user: RewardUser
  type: string
  amount: number
  orderId: string
  orderNo: string | null
  fromUserId: string | null
  level: number | null
  status: string
  createdAt: string
}

interface WithdrawalUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

interface WithdrawalReviewer {
  id: string
  phone: string
  nickname: string | null
}

interface WithdrawalItem {
  id: string
  userId: string
  user: WithdrawalUser
  amount: number
  status: string
  paymentMethod: string | null
  accountNumber: string | null
  accountName: string | null
  bankName: string | null
  rejectReason: string | null
  reviewedBy: string | null
  reviewer: WithdrawalReviewer | null
  reviewedAt: string | null
  paidAt: string | null
  createdAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ---- 映射 ----

const REWARD_TYPE_MAP: Record<string, { label: string; color: string }> = {
  referral:     { label: '推荐奖', color: 'bg-blue-50 text-blue-700' },
  brand_bonus:  { label: '品牌管理奖', color: 'bg-purple-50 text-purple-700' },
  dividend:     { label: '分红奖', color: 'bg-amber-50 text-amber-700' },
  manual:       { label: '手动发放', color: 'bg-green-50 text-green-700' },
}

const REWARD_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'referral', label: '推荐奖' },
  { value: 'brand_bonus', label: '品牌管理奖' },
  { value: 'dividend', label: '分红奖' },
]

const REWARD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待发放', color: 'bg-yellow-50 text-yellow-700' },
  paid:    { label: '已发放', color: 'bg-green-50 text-green-700' },
}

const WITHDRAWAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  approved:  { label: '已通过', color: 'bg-blue-50 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-50 text-green-700' },
  rejected:  { label: '已拒绝', color: 'bg-red-50 text-red-700' },
}

const WITHDRAWAL_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'completed', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
]

// ---- 主组件 ----

export default function AdminFinancePage() {
  const [token, setToken] = useState<string | null>(null)
  // v68:当前用户角色 + 权限检查
  const [userRole, setUserRole] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'rewards' | 'withdrawals'>('withdrawals')
  // v68:大额提现二次确认
  const [largeWithdrawalConfirm, setLargeWithdrawalConfirm] = useState<{ item: WithdrawalItem; type: 'approve' | 'reject' } | null>(null)
  // v68:操作权限
  const canApprove = hasPermission(userRole, 'approve')

  // 奖励流水状态
  const [rewards, setRewards] = useState<RewardItem[]>([])
  const [rewardPagination, setRewardPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [rewardLoading, setRewardLoading] = useState(true)
  const [rewardSearch, setRewardSearch] = useState('')
  const [rewardType, setRewardType] = useState('')
  const [rewardStartDate, setRewardStartDate] = useState('')
  const [rewardEndDate, setRewardEndDate] = useState('')

  // 提现审核状态
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([])
  const [withdrawalPagination, setWithdrawalPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [withdrawalLoading, setWithdrawalLoading] = useState(true)
  const [withdrawalStatus, setWithdrawalStatus] = useState('')
  const [withdrawalSearch, setWithdrawalSearch] = useState('')

  // 审核弹窗
  const [reviewModal, setReviewModal] = useState<{
    type: 'approve' | 'reject'
    item: WithdrawalItem
  } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // 手动发放弹窗
  const [manualModal, setManualModal] = useState(false)
  const [manualPhone, setManualPhone] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState(false)

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 批量审核
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchAction, setBatchAction] = useState<'approve' | 'reject'>('approve')
  const [batchRejectReason, setBatchRejectReason] = useState('')
  const [batchRemark, setBatchRemark] = useState('')
  const [batching, setBatching] = useState(false)

  // 拒绝模板
  const [rejectTemplates, setRejectTemplates] = useState<{ id: string; title: string; content: string }[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  // 审核日志弹窗
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditModalId, setAuditModalId] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  // 备注
  const [reviewRemark, setReviewRemark] = useState('')

  // 汇总统计
const [stats, setStats] = useState<{
  referral: { total: number; count: number }
  brand_bonus: { total: number; count: number }
  dividend: { total: number; count: number }
  grandTotal: number
  grandCount: number
} | null>(null)

  // 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    // v68.13:解析当前用户角色(canApprove 需要)
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setUserRole(u.role || '')
    } catch {}
    if (storedToken) {
      setToken(storedToken)
      fetchRewards(storedToken, 1)
      fetchWithdrawals(storedToken, 1)
      fetchRejectTemplates(storedToken)
    }
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // ---- 奖励流水 API ----

  const fetchRewards = useCallback(async (authToken: string, page: number) => {
    setRewardLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (rewardSearch) params.set('search', rewardSearch)
      if (rewardType) params.set('type', rewardType)
      if (rewardStartDate) params.set('startDate', rewardStartDate)
      if (rewardEndDate) params.set('endDate', rewardEndDate)

      const res = await fetch(`/api/admin/rewards?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setRewards(data.data || [])
        setRewardPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
        if (data.stats) setStats(data.stats)
      }
    } catch (error) {
      console.error('获取奖励流水失败:', error)
      showMessage('error', '获取奖励流水失败')
    } finally {
      setRewardLoading(false)
    }
  }, [rewardSearch, rewardType, rewardStartDate, rewardEndDate])

  // ---- 提现审核 API ----

  const fetchWithdrawals = useCallback(async (authToken: string, page: number) => {
    setWithdrawalLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (withdrawalStatus) params.set('status', withdrawalStatus)
      if (withdrawalSearch) params.set('search', withdrawalSearch)

      const res = await fetch(`/api/admin/withdrawals?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setWithdrawals(data.data || [])
        setWithdrawalPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
      }
    } catch (error) {
      console.error('获取提现列表失败:', error)
      showMessage('error', '获取提现列表失败')
    } finally {
      setWithdrawalLoading(false)
    }
  }, [withdrawalStatus, withdrawalSearch])

  const fetchRejectTemplates = async (authToken: string) => {
    try {
      const res = await fetch('/api/admin/withdrawal-templates', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (data.success) setRejectTemplates(data.data || [])
    } catch {}
  }

  const handleBatchReview = async () => {
    if (!token) return
    if (selectedIds.length === 0) { showMessage('error', '请选择至少一条记录'); return }
    if (batchAction === 'reject' && !batchRejectReason.trim()) { showMessage('error', '拒绝原因不能为空'); return }
    setBatching(true)
    try {
      const body: Record<string, unknown> = { ids: selectedIds, action: batchAction }
      if (batchAction === 'reject') body.rejectReason = batchRejectReason.trim()
      if (batchRemark.trim()) body.remark = batchRemark.trim()
      if (batchAction === 'reject' && selectedTemplateId) body.rejectTemplateId = selectedTemplateId
      const res = await fetch('/api/admin/withdrawals/batch-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message)
        setSelectedIds([])
        setBatchRejectReason('')
        setBatchRemark('')
        setSelectedTemplateId('')
        fetchWithdrawals(token, withdrawalPagination.page)
      } else {
        showMessage('error', data.message || '批量审核失败')
      }
    } catch {
      showMessage('error', '网络错误')
    } finally {
      setBatching(false)
    }
  }

  const handleViewAuditLogs = async (withdrawalId: string) => {
    if (!token) return
    setAuditModalId(withdrawalId)
    setAuditLoading(true)
    try {
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setAuditLogs(data.data || [])
    } catch {
      setAuditLogs([])
    } finally {
      setAuditLoading(false)
    }
  }

  // ---- 提现审核操作 ----

  const handleReview = async () => {
    if (!token || !reviewModal) return
    if (reviewModal.type === 'reject' && !rejectReason.trim()) {
      showMessage('error', '拒绝原因不能为空')
      return
    }
    setReviewing(true)
    try {
      const body: Record<string, unknown> = {
        id: reviewModal.item.id,
        action: reviewModal.type,
      }
      if (reviewModal.type === 'reject') {
        body.rejectReason = rejectReason.trim()
        if (selectedTemplateId) body.rejectTemplateId = selectedTemplateId
      }
      if (reviewRemark.trim()) body.remark = reviewRemark.trim()

      const res = await fetch('/api/admin/withdrawals', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', reviewModal.type === 'approve' ? '提现已通过' : '提现已拒绝')
        setReviewModal(null)
        setRejectReason('')
        setReviewRemark('')
        setSelectedTemplateId('')
        fetchWithdrawals(token, withdrawalPagination.page)
      } else {
        showMessage('error', data.message || '操作失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setReviewing(false)
    }
  }

  // ---- 手动发放奖励 ----

  const handleManualReward = async () => {
    if (!token) return
    if (!manualPhone.trim()) {
      showMessage('error', '手机号不能为空')
      return
    }
    const amount = parseFloat(manualAmount)
    if (!amount || amount <= 0) {
      showMessage('error', '金额必须大于 0')
      return
    }
    if (!manualReason.trim()) {
      showMessage('error', '发放原因不能为空')
      return
    }

    // 先根据手机号查找用户
    setManualSubmitting(true)
    try {
      const searchRes = await fetch(`/api/admin/users?search=${encodeURIComponent(manualPhone.trim())}&pageSize=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const searchData = await searchRes.json()
      if (!searchData.success || !searchData.data?.length) {
        showMessage('error', '未找到该手机号对应的用户')
        setManualSubmitting(false)
        return
      }
      const userId = searchData.data[0].id

      const res = await fetch('/api/admin/manual-reward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          amount,
          reason: manualReason.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', `已向 ${manualPhone} 发放 ¥${amount.toFixed(2)} 奖励`)
        setManualModal(false)
        setManualPhone('')
        setManualAmount('')
        setManualReason('')
        fetchRewards(token, 1)
      } else {
        showMessage('error', data.message || '手动发放失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setManualSubmitting(false)
    }
  }

  // ---- 搜索与分页 ----

  const handleRewardSearch = () => {
    if (token) fetchRewards(token, 1)
  }

  const handleWithdrawalSearch = () => {
    if (token) fetchWithdrawals(token, 1)
  }

  const handleRewardPageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= rewardPagination.totalPages) {
      fetchRewards(token, newPage)
    }
  }

  const handleWithdrawalPageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= withdrawalPagination.totalPages) {
      fetchWithdrawals(token, newPage)
    }
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
        <Wallet className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">财务管理</h1>
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

        {/* 标签页切换 */}
        <div className="flex items-center gap-1 mb-6 bg-white rounded-xl shadow-sm p-1.5">
          <button
            onClick={() => setActiveTab('rewards')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'rewards'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            奖励流水
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'withdrawals'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            提现审核
          </button>
          {/* 手动发放按钮 */}
          <button
            onClick={() => setManualModal(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5
              bg-green-600 text-white rounded-lg hover:bg-green-700
              transition-colors font-medium shadow-sm text-sm"
          >
            <Gift className="w-4 h-4" />
            手动发放
          </button>
        </div>

        {/* ===== 奖励流水标签页 ===== */}
        {activeTab === 'rewards' && (
          <>
            {/* 汇总统计卡片 */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
                  <p className="text-xs text-gray-500 mb-1">直推奖</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.referral.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.referral.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
                  <p className="text-xs text-gray-500 mb-1">品牌管理奖</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.brand_bonus.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.brand_bonus.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
                  <p className="text-xs text-gray-500 mb-1">分红奖</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.dividend.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.dividend.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
                  <p className="text-xs text-gray-500 mb-1">合计</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.grandTotal.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.grandCount} 笔</p>
                </div>
              </div>
            )}
            {/* 筛选栏 */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={rewardSearch}
                    onChange={e => setRewardSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRewardSearch()}
                    placeholder="搜索手机号/昵称..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  />
                </div>
                <select
                  value={rewardType}
                  onChange={e => setRewardType(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400"
                >
                  {REWARD_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={rewardStartDate}
                  onChange={e => setRewardStartDate(e.target.value)}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400 text-sm"
                  placeholder="开始日期"
                />
                <span className="text-gray-400 text-sm">至</span>
                <input
                  type="date"
                  value={rewardEndDate}
                  onChange={e => setRewardEndDate(e.target.value)}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400 text-sm"
                  placeholder="结束日期"
                />
                <button
                  onClick={handleRewardSearch}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                    transition-colors font-medium whitespace-nowrap"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* 奖励列表 */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
              {rewardLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : rewards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <DollarSign className="w-12 h-12 mb-3" />
                  <p>暂无奖励流水</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">类型</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金额</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单号</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">层级</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rewards.map(r => {
                        const typeInfo = REWARD_TYPE_MAP[r.type] || { label: r.type, color: 'bg-gray-100 text-gray-500' }
                        const statusInfo = REWARD_STATUS_MAP[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-500' }
                        return (
                          <tr key={`${r.type}-${r.id}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{r.user.phone}</div>
                              {r.user.nickname && (
                                <div className="text-xs text-gray-400">{r.user.nickname}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-green-600 font-medium">+¥{r.amount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {r.orderNo ? (
                                <span className="font-mono text-sm text-gray-700">{r.orderNo}</span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {r.level != null ? `第${r.level}层` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatTime(r.createdAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 分页 */}
              {!rewardLoading && rewardPagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-500">
                    共 {rewardPagination.total} 条记录，第 {rewardPagination.page}/{rewardPagination.totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRewardPageChange(rewardPagination.page - 1)}
                      disabled={rewardPagination.page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                        bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </button>
                    {Array.from({ length: rewardPagination.totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        if (rewardPagination.totalPages <= 7) return true
                        return Math.abs(p - rewardPagination.page) <= 2 || p === 1 || p === rewardPagination.totalPages
                      })
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1]
                        const showEllipsis = prev && p - prev > 1
                        return (
                          <span key={p} className="flex items-center">
                            {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                            <button
                              onClick={() => handleRewardPageChange(p)}
                              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                p === rewardPagination.page
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
                      onClick={() => handleRewardPageChange(rewardPagination.page + 1)}
                      disabled={rewardPagination.page >= rewardPagination.totalPages}
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
          </>
        )}

        {/* ===== 提现审核标签页 ===== */}
        {activeTab === 'withdrawals' && (
          <>
            {/* 筛选栏 */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={withdrawalSearch}
                    onChange={e => setWithdrawalSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleWithdrawalSearch()}
                    placeholder="搜索手机号/昵称..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  />
                </div>
                <select
                  value={withdrawalStatus}
                  onChange={e => setWithdrawalStatus(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400"
                >
                  {WITHDRAWAL_STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleWithdrawalSearch}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                    transition-colors font-medium whitespace-nowrap"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* 批量操作栏 */}
            {selectedIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
                <ListChecks className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">已选 {selectedIds.length} 条</span>
                <button onClick={() => setBatchAction('approve')} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${batchAction === 'approve' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'}`}>批量通过</button>
                <button onClick={() => setBatchAction('reject')} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${batchAction === 'reject' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'}`}>批量拒绝</button>
                {batchAction === 'reject' && (
                  <>
                    {rejectTemplates.length > 0 && (
                      <select value={selectedTemplateId} onChange={e => { setSelectedTemplateId(e.target.value); const t = rejectTemplates.find(t => t.id === e.target.value); if (t) setBatchRejectReason(t.content) }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900">
                        <option value="">选择模板...</option>
                        {rejectTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    )}
                    <input type="text" value={batchRejectReason} onChange={e => setBatchRejectReason(e.target.value)} placeholder="拒绝原因" className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" />
                  </>
                )}
                <input type="text" value={batchRemark} onChange={e => setBatchRemark(e.target.value)} placeholder="备注（选填）" className="flex-1 min-w-[150px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" />
                <button onClick={handleBatchReview} disabled={batching} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors">
                  {batching ? '处理中...' : '执行'}
                </button>
                <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">取消</button>
              </div>
            )}

            {/* 提现列表 */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
              {withdrawalLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : withdrawals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Wallet className="w-12 h-12 mb-3" />
                  <p>暂无提现记录</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">
                          <input type="checkbox" checked={withdrawals.length > 0 && withdrawals.filter(w => w.status === 'pending').every(w => selectedIds.includes(w.id))} onChange={e => { const pendingIds = withdrawals.filter(w => w.status === 'pending').map(w => w.id); setSelectedIds(e.target.checked ? pendingIds : []) }} className="rounded border-gray-300" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户信息</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">提现金额</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">收款信息</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">申请时间</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">审核人</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {withdrawals.map(w => {
                        const statusInfo = WITHDRAWAL_STATUS_MAP[w.status] || { label: w.status, color: 'bg-gray-100 text-gray-500' }
                        return (
                          <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              {w.status === 'pending' ? (
                                <input type="checkbox" checked={selectedIds.includes(w.id)} onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, w.id] : selectedIds.filter(id => id !== w.id))} className="rounded border-gray-300" />
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{w.user.phone}</div>
                              {w.user.nickname && (
                                <div className="text-xs text-gray-400">{w.user.nickname}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-red-600 font-medium">¥{w.amount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {w.paymentMethod ? (
                                <div className="text-sm">
                                  <div className="text-gray-900">
                                    {w.paymentMethod === 'alipay' ? '支付宝' : w.paymentMethod === 'wechat' ? '微信' : w.paymentMethod === 'bank_card' ? '银行卡' : w.paymentMethod}
                                  </div>
                                  <div className="text-xs text-gray-500 font-mono">{w.accountNumber}</div>
                                  <div className="text-xs text-gray-400">{w.accountName}{w.bankName ? ` · ${w.bankName}` : ''}</div>
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatTime(w.createdAt)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                              {w.status === 'rejected' && w.rejectReason && (
                                <div className="text-xs text-red-400 mt-1">原因：{w.rejectReason}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {w.reviewer ? (w.reviewer.nickname || w.reviewer.phone) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {w.status === 'pending' ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        if (!canApprove) { showMessage('error', '您没有审批权限,请联系超级管理员'); return }
                                        if (w.amount >= LARGE_WITHDRAWAL_THRESHOLD) {
                                          setLargeWithdrawalConfirm({ item: w, type: 'approve' })
                                        } else {
                                          setReviewModal({ type: 'approve', item: w })
                                        }
                                      }}
                                      disabled={!canApprove}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-600
                                        hover:bg-green-50 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      通过
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!canApprove) { showMessage('error', '您没有审批权限,请联系超级管理员'); return }
                                        setReviewModal({ type: 'reject', item: w })
                                      }}
                                      disabled={!canApprove}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600
                                        hover:bg-red-50 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      拒绝
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  onClick={() => handleViewAuditLogs(w.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500
                                    hover:bg-gray-100 rounded-lg transition-colors"
                                  title="审核日志"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
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
              {!withdrawalLoading && withdrawalPagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-500">
                    共 {withdrawalPagination.total} 条记录，第 {withdrawalPagination.page}/{withdrawalPagination.totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleWithdrawalPageChange(withdrawalPagination.page - 1)}
                      disabled={withdrawalPagination.page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                        bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </button>
                    {Array.from({ length: withdrawalPagination.totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        if (withdrawalPagination.totalPages <= 7) return true
                        return Math.abs(p - withdrawalPagination.page) <= 2 || p === 1 || p === withdrawalPagination.totalPages
                      })
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1]
                        const showEllipsis = prev && p - prev > 1
                        return (
                          <span key={p} className="flex items-center">
                            {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                            <button
                              onClick={() => handleWithdrawalPageChange(p)}
                              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                p === withdrawalPagination.page
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
                      onClick={() => handleWithdrawalPageChange(withdrawalPagination.page + 1)}
                      disabled={withdrawalPagination.page >= withdrawalPagination.totalPages}
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
          </>
        )}

      {/* 审核确认弹窗 */}
      {reviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setReviewModal(null); setRejectReason(''); setReviewRemark(''); setSelectedTemplateId('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {reviewModal.type === 'approve' ? '确认通过提现' : '拒绝提现申请'}
            </h3>
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">用户</span>
                <span className="text-gray-900">{reviewModal.item.user.phone}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">提现金额</span>
                <span className="text-red-600 font-medium">¥{reviewModal.item.amount.toFixed(2)}</span>
              </div>
              {reviewModal.item.paymentMethod && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">收款方式</span>
                    <span className="text-gray-900">
                      {reviewModal.item.paymentMethod === 'alipay' ? '支付宝' : reviewModal.item.paymentMethod === 'wechat' ? '微信' : reviewModal.item.paymentMethod === 'bank_card' ? '银行卡' : reviewModal.item.paymentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">收款账号</span>
                    <span className="text-gray-900 font-mono">{reviewModal.item.accountNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">收款人</span>
                    <span className="text-gray-900">{reviewModal.item.accountName}</span>
                  </div>
                  {reviewModal.item.bankName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">开户银行</span>
                      <span className="text-gray-900">{reviewModal.item.bankName}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">申请时间</span>
                <span className="text-gray-900">{formatTime(reviewModal.item.createdAt)}</span>
              </div>
            </div>

            {reviewModal.type === 'approve' ? (
              <p className="text-sm text-gray-500 mb-5">
                确认通过后，将从用户余额中扣除 ¥{reviewModal.item.amount.toFixed(2)}，此操作不可撤销。
              </p>
            ) : (
              <div className="mb-5">
                {rejectTemplates.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">快捷模板</label>
                    <select
                      value={selectedTemplateId}
                      onChange={e => { setSelectedTemplateId(e.target.value); const t = rejectTemplates.find(t => t.id === e.target.value); if (t) setRejectReason(t.content) }}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 hover:border-gray-400"
                    >
                      <option value="">选择模板...</option>
                      {rejectTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                )}
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  拒绝原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400
                    resize-none"
                  rows={3}
                  placeholder="请输入拒绝原因..."
                  autoFocus
                />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（选填）</label>
              <input
                type="text"
                value={reviewRemark}
                onChange={e => setReviewRemark(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="审核备注..."
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setReviewModal(null); setRejectReason(''); setReviewRemark(''); setSelectedTemplateId('') }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleReview}
                disabled={reviewing}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    reviewModal.type === 'approve'
                      ? reviewing
                        ? 'bg-green-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 shadow-sm'
                      : reviewing
                        ? 'bg-red-400 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 shadow-sm'
                  }`}
              >
                {reviewing && <Loader2 className="w-4 h-4 animate-spin" />}
                {reviewModal.type === 'approve' ? '确认通过' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 审核日志弹窗 */}
      {auditModalId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAuditModalId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">审核日志</h3>
              <button onClick={() => setAuditModalId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {auditLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /><span className="ml-2 text-gray-500">加载中...</span></div>
            ) : auditLogs.length === 0 ? (
              <p className="text-gray-400 text-center py-10">暂无审核记录</p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${log.action === 'approve' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.action === 'approve' ? '通过' : '拒绝'}
                      </span>
                      <span className="text-gray-400 text-xs">{formatTime(log.createdAt)}</span>
                    </div>
                    <div className="text-gray-600">
                      {log.oldStatus && log.newStatus && <span>{log.oldStatus} → {log.newStatus}</span>}
                      {log.reason && <span className="ml-2 text-red-500">原因：{log.reason}</span>}
                      {log.remark && <span className="ml-2 text-blue-500">备注：{log.remark}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 手动发放奖励弹窗 */}
      {manualModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setManualModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">手动发放奖励</h3>
              <button
                onClick={() => setManualModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  用户手机号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualPhone}
                  onChange={e => setManualPhone(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  placeholder="请输入用户手机号"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  发放金额 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={e => setManualAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                    placeholder="0.00"
                    min="0.01"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  发放原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={manualReason}
                  onChange={e => setManualReason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400
                    resize-none"
                  rows={3}
                  placeholder="请输入发放原因..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setManualModal(false)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleManualReward}
                disabled={manualSubmitting}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    manualSubmitting
                      ? 'bg-green-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 shadow-sm'
                  }`}
              >
                {manualSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <Gift className="w-4 h-4" />
                确认发放
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v68:大额提现二次确认 */}
      <ConfirmDialog
        open={!!largeWithdrawalConfirm}
        title="大额提现确认"
        mode="emphasize"
        confirmText="我已确认,执行"
        cancelText="取消"
        onConfirm={() => {
          if (!largeWithdrawalConfirm) return
          setReviewModal({ type: largeWithdrawalConfirm.type, item: largeWithdrawalConfirm.item })
          setLargeWithdrawalConfirm(null)
        }}
        onCancel={() => setLargeWithdrawalConfirm(null)}
        message={
          largeWithdrawalConfirm && (
            <div className="space-y-2">
              <p>这是一笔 <b className="text-red-600">¥{largeWithdrawalConfirm.item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b> 的大额提现,超过 ¥{LARGE_WITHDRAWAL_THRESHOLD.toLocaleString('zh-CN')} 阈值。</p>
              <p>请确认:</p>
              <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                <li>用户: <b>{largeWithdrawalConfirm.item.user.phone}</b> ({largeWithdrawalConfirm.item.user.nickname || '无昵称'})</li>
                <li>账号: {largeWithdrawalConfirm.item.accountName || '-'} / {largeWithdrawalConfirm.item.bankName || largeWithdrawalConfirm.item.accountNumber || '-'}</li>
              </ul>
              <p className="text-red-600 font-medium pt-2">⚠️ 此操作涉及真实资金,确认无误后再点确认。</p>
            </div>
          )
        }
      />
    </>
  )
}