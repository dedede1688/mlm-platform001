'use client'
import { logger } from '@/lib/logger'

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback } from 'react'
import {
  Wallet, CheckCircle, XCircle, Gift
} from 'lucide-react'
import { hasPermission } from '@/lib/admin-permissions'
const RechargeSettingsPanel = dynamic(() => import('@/components/admin/RechargeSettingsPanel'), { ssr: false })
const RewardsTab = dynamic(() => import('./_components/RewardsTab'), { ssr: false })
const WithdrawalsTab = dynamic(() => import('./_components/WithdrawalsTab'), { ssr: false })
const RechargeTab = dynamic(() => import('./_components/RechargeTab'), { ssr: false })
const FinanceModals = dynamic(() => import('./_components/FinanceModals'), { ssr: false })
import { getAuthToken, getAuthUserRole } from '@/lib/utils/auth-token'


// v68:大额提现阈值

// ---- 类型定义 ----

export interface RewardUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

export interface RewardItem {
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

export interface WithdrawalUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

export interface WithdrawalReviewer {
  id: string
  phone: string
  nickname: string | null
}

export interface WithdrawalItem {
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
  completedBy: string | null
  completedAt: string | null
  paymentProofUrl: string | null
  createdAt: string
}

export interface RechargeUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

export interface RechargeReviewer {
  id: string
  phone: string
  nickname: string | null
}

export interface RechargeItem {
  id: string
  userId: string
  user: RechargeUser
  amount: number
  paymentMethod: string
  paymentProofUrl: string
  status: string
  rejectReason: string | null
  rejectTemplateId: string | null
  reviewedBy: string | null
  reviewer: RechargeReviewer | null
  reviewedAt: string | null
  approvedAt: string | null
  remark: string | null
  createdAt: string
  updatedAt: string
}

export interface RechargeAuditLog {
  id: string
  requestId: string
  action: string
  oldStatus: string | null
  newStatus: string | null
  operatorId: string | null
  operator: { id: string; phone: string; nickname: string | null } | null
  reason: string | null
  remark: string | null
  createdAt: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ---- 主组件 ----


// ---- 主组件 ----

export default function AdminFinancePage() {
  const [token, setToken] = useState<string | null>(null)
  // v68:当前用户角色 + 权限检查
  const [userRole, setUserRole] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'rewards' | 'withdrawals' | 'recharge' | 'settings'>('withdrawals')
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

  // 充值审核状态
  const [recharges, setRecharges] = useState<RechargeItem[]>([])
  const [rechargePagination, setRechargePagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [rechargeLoading, setRechargeLoading] = useState(false)
  const [rechargeStatus, setRechargeStatus] = useState('')
  const [rechargeSearch, setRechargeSearch] = useState('')

  // 充值审核弹窗（独立于提现审核弹窗）
  const [rechargeReviewModal, setRechargeReviewModal] = useState<{
    type: 'approve' | 'reject'
    item: RechargeItem
  } | null>(null)
  const [rechargeRejectReason, setRechargeRejectReason] = useState('')
  const [rechargeReviewRemark, setRechargeReviewRemark] = useState('')
  const [rechargeReviewLoading, setRechargeReviewLoading] = useState(false)

  // 充值审核日志弹窗（独立于提现审核日志）
  const [rechargeAuditModalId, setRechargeAuditModalId] = useState<string | null>(null)
  const [rechargeAuditLogs, setRechargeAuditLogs] = useState<RechargeAuditLog[]>([])
  const [rechargeAuditLoading, setRechargeAuditLoading] = useState(false)

  // 审核弹窗
  const [reviewModal, setReviewModal] = useState<{
    type: 'approve' | 'reject'
    item: WithdrawalItem
  } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // 完成打款弹窗
  const [completeModal, setCompleteModal] = useState<WithdrawalItem | null>(null)
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [completeRemark, setCompleteRemark] = useState('')
  const [completing, setCompleting] = useState(false)

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
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; createdAt: string; oldStatus?: string; newStatus?: string; reason?: string; remark?: string; user?: { nickname?: string } }>>([])
  const [auditModalId, setAuditModalId] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  // 凭证查看弹窗
  const [proofViewerUrl, setProofViewerUrl] = useState<string | null>(null)

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
    const storedToken = getAuthToken()
    // v68.13:解析当前用户角色(canApprove 需要)
    setUserRole(getAuthUserRole())
    if (storedToken) {
      setToken(storedToken)
      fetchRewards(storedToken, 1)
      fetchWithdrawals(storedToken, 1)
      fetchRejectTemplates(storedToken)
      fetchRecharges(storedToken, 1)
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
      logger.error('获取奖励流水失败:', error)
      showMessage('error', '获取奖励流水失败')
    } finally {
      setRewardLoading(false)
    }
  }, [rewardSearch, rewardType, rewardStartDate, rewardEndDate])

  // ---- 充值审核 API ----

  const fetchRecharges = useCallback(async (authToken: string, page: number) => {
    setRechargeLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (rechargeStatus) params.set('status', rechargeStatus)
      if (rechargeSearch) params.set('search', rechargeSearch)

      const res = await fetch(`/api/admin/recharge?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setRecharges(data.data || [])
        setRechargePagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
      }
    } catch (error) {
      logger.error('获取充值列表失败:', error)
      showMessage('error', '获取充值列表失败')
    } finally {
      setRechargeLoading(false)
    }
  }, [rechargeStatus, rechargeSearch])

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
      logger.error('获取提现列表失败:', error)
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

  // ---- 完成打款操作 ----

  const handleComplete = async () => {
    if (!token || !completeModal) return
    if (!paymentProofUrl.trim()) {
      showMessage('error', '请输入打款凭证 URL')
      return
    }
    setCompleting(true)
    try {
      const body: Record<string, unknown> = {
        paymentProofUrl: paymentProofUrl.trim(),
      }
      if (completeRemark.trim()) body.remark = completeRemark.trim()

      const res = await fetch(`/api/admin/withdrawals/${completeModal.id}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '提现打款已完成')
        setCompleteModal(null)
        setPaymentProofUrl('')
        setCompleteRemark('')
        fetchWithdrawals(token, withdrawalPagination.page)
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

  const handleRewardSearch = () => {
    if (token) fetchRewards(token, 1)
  }

  const handleWithdrawalSearch = () => {
    if (token) fetchWithdrawals(token, 1)
  }

  const handleRechargeSearch = () => {
    if (token) fetchRecharges(token, 1)
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

  const handleRechargePageChange = (newPage: number) => {
    if (token && newPage >= 1 && newPage <= rechargePagination.totalPages) {
      fetchRecharges(token, newPage)
    }
  }

  // ---- 充值审核日志 ----

  const handleViewRechargeAuditLogs = async (rechargeId: string) => {
    if (!token) return
    setRechargeAuditModalId(rechargeId)
    setRechargeAuditLoading(true)
    try {
      const res = await fetch(`/api/admin/recharge/${rechargeId}/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setRechargeAuditLogs(data.data || [])
      } else {
        showMessage('error', '获取充值审核日志失败')
      }
    } catch {
      showMessage('error', '获取充值审核日志失败')
    } finally {
      setRechargeAuditLoading(false)
    }
  }

  const closeRechargeAuditModal = () => {
    setRechargeAuditModalId(null)
    setRechargeAuditLogs([])
    setRechargeAuditLoading(false)
  }

  // ---- 充值审核操作 ----

  const handleRechargeReview = async () => {
    if (!token || !rechargeReviewModal) return
    if (rechargeReviewModal.type === 'reject' && !rechargeRejectReason.trim()) {
      showMessage('error', '请填写拒绝原因')
      return
    }
    setRechargeReviewLoading(true)
    try {
      const body: Record<string, unknown> = {
        action: rechargeReviewModal.type,
      }
      if (rechargeReviewModal.type === 'reject') {
        body.rejectReason = rechargeRejectReason.trim()
      }
      if (rechargeReviewRemark.trim()) body.remark = rechargeReviewRemark.trim()

      const res = await fetch(`/api/admin/recharge/${rechargeReviewModal.item.id}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        showMessage('success', rechargeReviewModal.type === 'approve' ? '充值审核已通过' : '充值审核已拒绝')
        setRechargeReviewModal(null)
        setRechargeRejectReason('')
        setRechargeReviewRemark('')
        fetchRecharges(token, rechargePagination.page)
      } else {
        showMessage('error', data.message || '充值审核失败')
      }
    } catch {
      showMessage('error', '网络错误，请重试')
    } finally {
      setRechargeReviewLoading(false)
    }
  }

  // ---- 凭证查看弹窗 ----

  const openProofViewer = (url: string) => {
    setProofViewerUrl(url)
  }

  const closeProofViewer = () => {
    setProofViewerUrl(null)
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
          <button
            onClick={() => setActiveTab('recharge')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'recharge'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            充值审核
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            充值设置
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
          <RewardsTab
            token={token}
            rewards={rewards}
            rewardPagination={rewardPagination}
            rewardLoading={rewardLoading}
            rewardSearch={rewardSearch}
            rewardType={rewardType}
            rewardStartDate={rewardStartDate}
            rewardEndDate={rewardEndDate}
            stats={stats}
            onSearchFieldChange={(field, value) => {
              if (field === 'rewardSearch') setRewardSearch(value)
              else if (field === 'rewardType') setRewardType(value)
              else if (field === 'rewardStartDate') setRewardStartDate(value)
              else if (field === 'rewardEndDate') setRewardEndDate(value)
            }}
            onSearch={handleRewardSearch}
            onPageChange={handleRewardPageChange}
          />
        )}

        {/* ===== 提现审核标签页 ===== */}
        {activeTab === 'withdrawals' && (
          <WithdrawalsTab
            token={token}
            withdrawals={withdrawals}
            withdrawalPagination={withdrawalPagination}
            withdrawalLoading={withdrawalLoading}
            withdrawalSearch={withdrawalSearch}
            withdrawalStatus={withdrawalStatus}
            selectedIds={selectedIds}
            batchAction={batchAction}
            batchRejectReason={batchRejectReason}
            batchRemark={batchRemark}
            rejectTemplates={rejectTemplates}
            selectedTemplateId={selectedTemplateId}
            setWithdrawalSearch={setWithdrawalSearch}
            setWithdrawalStatus={setWithdrawalStatus}
            setSelectedIds={setSelectedIds}
            setBatchAction={setBatchAction}
            setBatchRejectReason={setBatchRejectReason}
            setBatchRemark={setBatchRemark}
            setSelectedTemplateId={setSelectedTemplateId}
            setReviewModal={setReviewModal}
            setCompleteModal={setCompleteModal}
            setLargeWithdrawalConfirm={setLargeWithdrawalConfirm}
            onSearch={handleWithdrawalSearch}
            onPageChange={handleWithdrawalPageChange}
            onBatchReview={handleBatchReview}
            onViewAuditLogs={handleViewAuditLogs}
            batching={batching}
            canApprove={canApprove}
            showMessage={showMessage}
          />
        )}

        {/* ===== 充值审核标签页 ===== */}
        {activeTab === 'recharge' && (
          <RechargeTab
            token={token}
            recharges={recharges}
            rechargePagination={rechargePagination}
            rechargeLoading={rechargeLoading}
            rechargeSearch={rechargeSearch}
            rechargeStatus={rechargeStatus}
            canApprove={canApprove}
            setRechargeSearch={setRechargeSearch}
            setRechargeStatus={setRechargeStatus}
            setRechargeReviewModal={setRechargeReviewModal}
            onSearch={handleRechargeSearch}
            onPageChange={handleRechargePageChange}
            onViewAuditLogs={handleViewRechargeAuditLogs}
            openProofViewer={openProofViewer}
          />
        )}

        {/* ===== 充值设置标签页 ===== */}
        {activeTab === 'settings' && token && (
          <RechargeSettingsPanel token={token} onMessage={showMessage} />
        )}

      <FinanceModals
        rechargeReviewModal={rechargeReviewModal}
        onRechargeReviewClose={() => { setRechargeReviewModal(null); setRechargeRejectReason(''); setRechargeReviewRemark('') }}
        rechargeRejectReason={rechargeRejectReason}
        onRechargeRejectReasonChange={setRechargeRejectReason}
        rechargeReviewRemark={rechargeReviewRemark}
        onRechargeReviewRemarkChange={setRechargeReviewRemark}
        rechargeReviewLoading={rechargeReviewLoading}
        onRechargeReviewSubmit={handleRechargeReview}
        rechargeAuditModalId={rechargeAuditModalId}
        onRechargeAuditModalClose={closeRechargeAuditModal}
        rechargeAuditLogs={rechargeAuditLogs}
        rechargeAuditLoading={rechargeAuditLoading}
        proofViewerUrl={proofViewerUrl}
        onProofViewerClose={closeProofViewer}
        reviewModal={reviewModal}
        onReviewModalClose={() => { setReviewModal(null); setRejectReason(''); setReviewRemark(''); setSelectedTemplateId('') }}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        reviewRemark={reviewRemark}
        onReviewRemarkChange={setReviewRemark}
        reviewing={reviewing}
        onReviewSubmit={handleReview}
        rejectTemplates={rejectTemplates}
        selectedTemplateId={selectedTemplateId}
        onSelectedTemplateIdChange={setSelectedTemplateId}
        auditModalId={auditModalId}
        onAuditModalClose={() => setAuditModalId(null)}
        auditLogs={auditLogs}
        auditLoading={auditLoading}
        manualModal={manualModal}
        onManualModalClose={() => setManualModal(false)}
        manualPhone={manualPhone}
        onManualPhoneChange={setManualPhone}
        manualAmount={manualAmount}
        onManualAmountChange={setManualAmount}
        manualReason={manualReason}
        onManualReasonChange={setManualReason}
        manualSubmitting={manualSubmitting}
        onManualRewardSubmit={handleManualReward}
        largeWithdrawalConfirm={largeWithdrawalConfirm}
        onLargeWithdrawalConfirm={() => {
          if (!largeWithdrawalConfirm) return
          setReviewModal({ type: largeWithdrawalConfirm.type, item: largeWithdrawalConfirm.item })
          setLargeWithdrawalConfirm(null)
        }}
        onLargeWithdrawalCancel={() => setLargeWithdrawalConfirm(null)}
        completeModal={completeModal}
        onCompleteModalClose={() => { setCompleteModal(null); setPaymentProofUrl(''); setCompleteRemark('') }}
        paymentProofUrl={paymentProofUrl}
        onPaymentProofUrlChange={setPaymentProofUrl}
        completeRemark={completeRemark}
        onCompleteRemarkChange={setCompleteRemark}
        completing={completing}
        onCompleteSubmit={handleComplete}
        openProofViewer={openProofViewer}
      />

    </>
  )
}
