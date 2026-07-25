'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Wallet, Search, Loader2, ChevronLeft, ChevronRight,
  X, CheckCircle, XCircle, DollarSign, Gift,
  ListChecks, History,
  ArrowDownCircle, ZoomIn, ZoomOut, Maximize2, Minimize2, ImageOff, AlertTriangle
} from 'lucide-react'
import { hasPermission } from '@/lib/admin-permissions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import RechargeSettingsPanel from '@/components/admin/RechargeSettingsPanel'
import RewardsTab from './_components/RewardsTab'
import WithdrawalsTab from './_components/WithdrawalsTab'
import RechargeTab from './_components/RechargeTab'
import { getAuthToken } from '@/lib/utils/auth-token'

// v68:大额提现阈值
const LARGE_WITHDRAWAL_THRESHOLD = 5000

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
  { value: 'approved', label: '已审核通过' },
  { value: 'completed', label: '已打款完成' },
  { value: 'rejected', label: '已拒绝' },
]

const RECHARGE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  approved: { label: '已通过', color: 'bg-green-50 text-green-700' },
  rejected: { label: '已拒绝', color: 'bg-red-50 text-red-700' },
}

const RECHARGE_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
]

const RECHARGE_PAYMENT_METHOD_MAP: Record<string, string> = {
  qr_code: '二维码扫码充值',
  alipay: '支付宝',
  wechat: '微信',
  bank_card: '银行卡',
  other: '其他',
}

const RECHARGE_AUDIT_ACTION_MAP: Record<string, string> = {
  submit:  '提交申请',
  approve: '审核通过',
  reject:  '审核拒绝',
}

const RECHARGE_AUDIT_STATUS_MAP: Record<string, string> = {
  pending:  '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

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
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditModalId, setAuditModalId] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  // 凭证查看弹窗
  const [proofViewerUrl, setProofViewerUrl] = useState<string | null>(null)
  const [proofViewerScale, setProofViewerScale] = useState(1)
  const [proofViewerOffset, setProofViewerOffset] = useState({ x: 0, y: 0 })
  const [proofViewerDragging, setProofViewerDragging] = useState(false)
  const [proofViewerError, setProofViewerError] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

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
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setUserRole(u.role || '')
    } catch {}
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
      console.error('获取奖励流水失败:', error)
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
      console.error('获取充值列表失败:', error)
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
    setProofViewerScale(1)
    setProofViewerOffset({ x: 0, y: 0 })
    setProofViewerError(false)
  }

  const closeProofViewer = () => {
    setProofViewerUrl(null)
    setProofViewerScale(1)
    setProofViewerOffset({ x: 0, y: 0 })
    setProofViewerDragging(false)
    setProofViewerError(false)
  }

  const handleProofWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setProofViewerScale(prev => Math.min(4, Math.max(0.5, prev + delta)))
  }

  const handleProofMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setProofViewerDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: proofViewerOffset.x,
      offsetY: proofViewerOffset.y,
    }
  }

  const handleProofMouseMove = (e: React.MouseEvent) => {
    if (!proofViewerDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setProofViewerOffset({
      x: dragStartRef.current.offsetX + dx,
      y: dragStartRef.current.offsetY + dy,
    })
  }

  const handleProofMouseUp = () => {
    setProofViewerDragging(false)
  }

  const handleZoomIn = () => {
    setProofViewerScale(prev => Math.min(4, prev + 0.25))
  }

  const handleZoomOut = () => {
    setProofViewerScale(prev => Math.max(0.5, prev - 0.25))
  }

  const handleResetZoom = () => {
    setProofViewerScale(1)
    setProofViewerOffset({ x: 0, y: 0 })
  }

  const handleFitToWindow = () => {
    setProofViewerScale(1)
    setProofViewerOffset({ x: 0, y: 0 })
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

      {/* ===== 充值审核弹窗 ===== */}
      {rechargeReviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setRechargeReviewModal(null); setRechargeRejectReason(''); setRechargeReviewRemark('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {rechargeReviewModal.type === 'approve' ? '确认通过充值' : '拒绝充值申请'}
            </h3>
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">用户</span>
                <span className="text-gray-900">{rechargeReviewModal.item.user.phone}</span>
              </div>
              {rechargeReviewModal.item.user.nickname && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">昵称</span>
                  <span className="text-gray-900">{rechargeReviewModal.item.user.nickname}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">充值金额</span>
                <span className="text-green-600 font-medium">¥{rechargeReviewModal.item.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">支付方式</span>
                <span className="text-gray-900">
                  {RECHARGE_PAYMENT_METHOD_MAP[rechargeReviewModal.item.paymentMethod] || rechargeReviewModal.item.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">付款凭证</span>
                {rechargeReviewModal.item.paymentProofUrl ? (
                  <button
                    onClick={() => openProofViewer(rechargeReviewModal.item.paymentProofUrl)}
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    查看凭证
                  </button>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">申请时间</span>
                <span className="text-gray-900">{formatTime(rechargeReviewModal.item.createdAt)}</span>
              </div>
            </div>

            {rechargeReviewModal.type === 'approve' ? (
              <p className="text-sm text-gray-500 mb-5">
                审核通过后，充值金额将计入用户余额。
              </p>
            ) : (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  拒绝原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rechargeRejectReason}
                  onChange={e => setRechargeRejectReason(e.target.value)}
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
                value={rechargeReviewRemark}
                onChange={e => setRechargeReviewRemark(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="审核备注..."
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setRechargeReviewModal(null); setRechargeRejectReason(''); setRechargeReviewRemark('') }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleRechargeReview}
                disabled={rechargeReviewLoading}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    rechargeReviewModal.type === 'approve'
                      ? rechargeReviewLoading
                        ? 'bg-green-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 shadow-sm'
                      : rechargeReviewLoading
                        ? 'bg-red-400 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 shadow-sm'
                  }`}
              >
                {rechargeReviewLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {rechargeReviewModal.type === 'approve' ? '确认通过' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 充值审核日志弹窗 ===== */}
      {rechargeAuditModalId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeRechargeAuditModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">充值审核日志</h3>
              <button onClick={closeRechargeAuditModal} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {rechargeAuditLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-500">加载中...</span>
              </div>
            ) : rechargeAuditLogs.length === 0 ? (
              <p className="text-gray-400 text-center py-10">暂无日志</p>
            ) : (
              <div className="space-y-3">
                {rechargeAuditLogs.map((log) => {
                  const actionLabel = RECHARGE_AUDIT_ACTION_MAP[log.action] || log.action
                  const oldStatusLabel = log.oldStatus ? (RECHARGE_AUDIT_STATUS_MAP[log.oldStatus] || log.oldStatus) : '-'
                  const newStatusLabel = log.newStatus ? (RECHARGE_AUDIT_STATUS_MAP[log.newStatus] || log.newStatus) : '-'
                  return (
                    <div key={log.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.action === 'approve' ? 'bg-green-100 text-green-700'
                            : log.action === 'reject' ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {actionLabel}
                        </span>
                        <span className="text-gray-400 text-xs">{formatTime(log.createdAt)}</span>
                      </div>
                      <div className="space-y-1 text-gray-600">
                        {log.operator && (
                          <div>
                            <span className="text-gray-400">操作人：</span>
                            <span className="text-gray-700">{log.operator.phone}{log.operator.nickname ? ` (${log.operator.nickname})` : ''}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-400">状态变更：</span>
                          <span className="text-gray-700">{oldStatusLabel} → {newStatusLabel}</span>
                        </div>
                        {log.reason && (
                          <div>
                            <span className="text-gray-400">原因：</span>
                            <span className="text-red-500">{log.reason}</span>
                          </div>
                        )}
                        {log.remark && (
                          <div>
                            <span className="text-gray-400">备注：</span>
                            <span className="text-blue-500">{log.remark}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 凭证查看弹窗 ===== */}
      {proofViewerUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={closeProofViewer} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">付款凭证</h3>
              <button
                onClick={closeProofViewer}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 工具栏 */}
            <div className="flex items-center justify-center gap-2 px-5 py-2 border-b border-gray-100 bg-gray-50">
              <button
                onClick={handleZoomOut}
                disabled={proofViewerScale <= 0.5}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
                缩小
              </button>
              <span className="text-sm text-gray-500 min-w-[50px] text-center">
                {Math.round(proofViewerScale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={proofViewerScale >= 4}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
                放大
              </button>
              <button
                onClick={handleResetZoom}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
                原始大小
              </button>
              <button
                onClick={handleFitToWindow}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
                适应窗口
              </button>
            </div>

            {/* 图片区域 */}
            <div
              className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 relative"
              style={{
                minHeight: '300px',
                maxHeight: 'calc(90vh - 120px)',
                cursor: proofViewerDragging ? 'grabbing' : 'grab',
              }}
              onWheel={handleProofWheel}
              onMouseDown={handleProofMouseDown}
              onMouseMove={handleProofMouseMove}
              onMouseUp={handleProofMouseUp}
              onMouseLeave={handleProofMouseUp}
            >
              {proofViewerError ? (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <ImageOff className="w-12 h-12 mb-3" />
                  <p className="text-sm">图片加载失败，请检查凭证链接</p>
                </div>
              ) : (
                <img
                  src={proofViewerUrl}
                  alt="付款凭证"
                  draggable={false}
                  onError={() => setProofViewerError(true)}
                  style={{
                    transform: `scale(${proofViewerScale}) translate(${proofViewerOffset.x / proofViewerScale}px, ${proofViewerOffset.y / proofViewerScale}px)`,
                    transition: proofViewerDragging ? 'none' : 'transform 0.1s ease-out',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </div>
        </div>
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
                审核通过后状态变为「已审核通过」，等待财务线下打款。审核通过不会直接扣款，需后续在「完成打款」操作中上传凭证。
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${log.action === 'approve' ? 'bg-green-100 text-green-700' : log.action === 'reject' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {log.action === 'approve' ? '通过' : log.action === 'reject' ? '拒绝' : '完成打款'}
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
              <p className="text-red-600 font-medium pt-2"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 此操作涉及真实资金,确认无误后再点确认。</p>
            </div>
          )
        }
      />

      {/* 完成打款弹窗 */}
      {completeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setCompleteModal(null); setPaymentProofUrl(''); setCompleteRemark('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">完成提现打款</h3>
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">用户</span>
                <span className="text-gray-900">{completeModal.user.phone}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">提现金额</span>
                <span className="text-red-600 font-medium">¥{completeModal.amount.toFixed(2)}</span>
              </div>
              {completeModal.paymentMethod && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">收款方式</span>
                    <span className="text-gray-900">
                      {completeModal.paymentMethod === 'alipay' ? '支付宝' : completeModal.paymentMethod === 'wechat' ? '微信' : completeModal.paymentMethod === 'bank_card' ? '银行卡' : completeModal.paymentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">收款账号</span>
                    <span className="text-gray-900 font-mono">{completeModal.accountNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">收款人</span>
                    <span className="text-gray-900">{completeModal.accountName}</span>
                  </div>
                  {completeModal.bankName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">开户银行</span>
                      <span className="text-gray-900">{completeModal.bankName}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-sm text-blue-600 mb-4">
              确认打款后，将从用户冻结收益中扣除 ¥{completeModal.amount.toFixed(2)}。
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                打款凭证 URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={paymentProofUrl}
                onChange={e => setPaymentProofUrl(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="请输入打款凭证图片地址或转账截图 URL"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（选填）</label>
              <input
                type="text"
                value={completeRemark}
                onChange={e => setCompleteRemark(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="打款备注..."
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setCompleteModal(null); setPaymentProofUrl(''); setCompleteRemark('') }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleComplete}
                disabled={completing}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                  text-white font-medium transition-all ${
                    completing
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
                  }`}
              >
                {completing && <Loader2 className="w-4 h-4 animate-spin" />}
                <DollarSign className="w-4 h-4" />
                确认完成打款
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}