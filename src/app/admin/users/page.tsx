'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils/format'

import {
  Users, Search, Loader2, ChevronLeft, ChevronRight,
  X, Eye, Network, ChevronDown, ChevronUp, Wallet,
  Lock, LockOpen, Download, AlertTriangle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import ReferralTreePanel from '@/components/ReferralTreePanel'
import { hasPermission } from '@/lib/admin-permissions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

// ---- 类型定义 ----

interface UserRow {
  id: string
  phone: string
  nickname: string | null
  level: number
  balance: number
  frozenBalance: number
  consumeBalance: number
  earningsPending: number
  earningsAvailable: number
  earningsFrozen: number
  earningsVoided: number
  totalPoints: number
  unlockedPoints: number
  lockedPoints: number
  referrer: { id: string; nickname: string | null; phone: string } | null
  parentId: string | null
  position: number | null
  upgradeProductCount: number
  directSalesAmount: number
  directDistributorCount: number
  directReferralCount: number
  orderCount: number
  totalOrderAmount: number
  status: string
  role: string
  createdAt: string
  updatedAt: string
  // v018: 支付密码状态（布尔值，不泄露哈希）
  hasPaymentPassword: boolean
}

interface RelatedUser {
  id: string
  phone: string
  nickname: string | null
  level: number
}

interface ReferralItem {
  id: string
  phone: string
  nickname: string | null
  level: number
  createdAt: string
}

interface ChildItem {
  id: string
  phone: string
  nickname: string | null
  level: number
  position: number | null
}

interface UserDetail extends UserRow {
  email: string | null
  role: string
  referrer: RelatedUser | null
  parent: RelatedUser | null
  referrals: ReferralItem[]
  children: ChildItem[]
  orderCount: number
  totalOrderAmount: number
  // v018: 支付密码状态（继承自 UserRow）
  hasPaymentPassword: boolean
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ---- 等级映射 ----

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-500',
  1: 'bg-blue-50 text-blue-700',
  2: 'bg-green-50 text-green-700',
  3: 'bg-yellow-50 text-yellow-700',
  4: 'bg-orange-50 text-orange-700',
  5: 'bg-purple-50 text-purple-700',
  6: 'bg-red-50 text-red-700',
  7: 'bg-amber-50 text-amber-800',
}

const LEVEL_OPTIONS = [
  { value: '', label: '全部等级' },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `${i} - ${LEVEL_NAMES[i]}` })),
]

// ---- 标签页定义 ----

const DETAIL_TABS = [
  { key: 'basic', label: '基本资料' },
  { key: 'finance', label: '资金账户' },
  { key: 'stats', label: '经营统计' },
  { key: 'relation', label: '推荐关系' },
  { key: 'referrals', label: '直推列表' },
] as const

// ---- 主组件 ----

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  // 搜索与筛选
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

// 详情弹窗
const [detailUser, setDetailUser] = useState<UserDetail | null>(null)
const [detailLoading, setDetailLoading] = useState(false)

// 浮动推荐树面板 (v27)
const [treeUserId, setTreeUserId] = useState<string | null>(null)
const [treeUserName, setTreeUserName] = useState<string>('')

  // 等级调整
  const [newLevel, setNewLevel] = useState<number>(0)
  const [savingLevel, setSavingLevel] = useState(false)

  // 资金调整
  const [balanceType, setBalanceType] = useState<'balance' | 'frozenBalance' | 'earnings_add' | 'earnings_void'>('balance')
  const [balanceAmount, setBalanceAmount] = useState<string>('')
  const [balanceReason, setBalanceReason] = useState('')
  const [savingBalance, setSavingBalance] = useState(false)

  // 状态管理
  const [newStatus, setNewStatus] = useState<string>('')
  const [statusReason, setStatusReason] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  // 积分调整
  const [pointsType, setPointsType] = useState<'totalPoints' | 'unlockedPoints' | 'lockedPoints'>('totalPoints')
  const [pointsAmount, setPointsAmount] = useState<string>('')
  const [pointsReason, setPointsReason] = useState('')
  const [savingPoints, setSavingPoints] = useState(false)

  // 基础资料修改
  const [profilePhone, setProfilePhone] = useState<string>('')
  const [profileNickname, setProfileNickname] = useState<string>('')
  const [profileEmail, setProfileEmail] = useState<string>('')
  const [profileRole, setProfileRole] = useState<string>('')
  const [profileReason, setProfileReason] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // 密码重置（登录密码）
  const [resetPassword, setResetPassword] = useState<string>('')
  const [passwordReason, setPasswordReason] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // v018: 支付密码重置
  const [payPwdResetReason, setPayPwdResetReason] = useState<string>('')
  const [payPwdResetSuffix, setPayPwdResetSuffix] = useState<string>('')
  const [savingPayPwdReset, setSavingPayPwdReset] = useState(false)
  const [showPayPwdConfirm, setShowPayPwdConfirm] = useState(false)

  // v019: 清空支付密码重置表单状态（防止切换/关闭会员详情时串台）
  const resetPaymentPasswordResetState = () => {
    setPayPwdResetReason('')
    setPayPwdResetSuffix('')
    setShowPayPwdConfirm(false)
  }

  // v019: 统一关闭会员详情弹窗（同时清空 detailUser 和支付密码重置状态）
  const closeDetailModal = () => {
    resetPaymentPasswordResetState()
    setDetailUser(null)
  }

  // v022: 手机号后四位匹配校验
  const actualPhoneSuffix = detailUser?.phone ? detailUser.phone.slice(-4) : ''
  const normalizedSuffix = payPwdResetSuffix.trim()
  const suffixMatches = /^\d{4}$/.test(normalizedSuffix) && normalizedSuffix === actualPhoneSuffix

  // v018: 支付密码重置处理
  const handleResetPaymentPassword = async () => {
    if (!token || !detailUser) return
    if (userRole !== 'super_admin') { showMessage('error', '只有超级管理员可以重置支付密码'); return }
    if (payPwdResetReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
    if (!/^\d{4}$/.test(normalizedSuffix)) { showMessage('error', '请输入手机号后 4 位'); return }
    if (normalizedSuffix !== actualPhoneSuffix) { showMessage('error', '手机号后 4 位不匹配，请核对后重试'); return }
    setShowPayPwdConfirm(true)
  }

  // 实际执行支付密码重置（二次确认后）
  const doResetPaymentPassword = async () => {
    if (!token || !detailUser) return
    if (normalizedSuffix !== actualPhoneSuffix) {
      showMessage('error', '手机号后 4 位不匹配，请核对后重试')
      setShowPayPwdConfirm(false)
      return
    }
    setSavingPayPwdReset(true)
    setShowPayPwdConfirm(false)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}/payment-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: payPwdResetReason.trim(), phoneSuffix: normalizedSuffix }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '支付密码已重置，请通知用户重新设置')
        setDetailUser(prev => prev ? { ...prev, hasPaymentPassword: false } : null)
        setPayPwdResetReason('')
        setPayPwdResetSuffix('')
      } else { showMessage('error', data.error || data.message || '重置失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingPayPwdReset(false) }
  }

  // v68.7:操作权限 + 大额二次确认
  const [userRole, setUserRole] = useState<string>('')
  // v68.8:Page 自带权限 fetch 兜底(避免 layout 不重 mount 导致 window 过期)
  const [permsLoaded, setPermsLoaded] = useState(false)
  // v68.8:用 useMemo 让 canX 在 userRole/permsLoaded 变化时重新计算
  const canUpdate = useMemo(() => hasPermission(userRole, 'update'), [userRole, permsLoaded])   // 状态变更
  const canApprove = useMemo(() => hasPermission(userRole, 'approve'), [userRole, permsLoaded]) // 余额/积分/密码重置
  // 大额二次确认:弹 3 个独立 confirm state(代码更简洁)
  const [balanceConfirm, setBalanceConfirm] = useState<number | null>(null)  // 待确认的余额金额
  const [pointsConfirm, setPointsConfirm] = useState<number | null>(null)    // 待确认的积分数值
  const [passwordConfirm, setPasswordConfirm] = useState(false)              // 密码重置二次确认
  const LARGE_BALANCE_THRESHOLD = 1000  // 余额 ≥1000 元弹二次确认
  const LARGE_POINTS_THRESHOLD = 5000   // 积分 ≥5000 弹二次确认

  // 展开区块
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    stats: true, relation: true, referrals: true, children: false, level: false, balance: false, points: true, profile: false, password: true, status: false,
    paymentPassword: true,  // v018: 支付安全区块
  })

  // 详情弹窗标签页
  const [detailTab, setDetailTab] = useState<'basic' | 'finance' | 'stats' | 'relation' | 'referrals'>('basic')

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      fetchUsers(storedToken, 1)
    }
    // v68.7:解析当前用户角色
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      setUserRole(u.role || '')
    } catch {}
    // v68.8:Page 自己也 fetch role-permissions(避免 layout 不重 mount 导致 window 过期)
    if (storedToken) {
      fetch('/api/admin/role-permissions', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data?.success && data?.data?.config) {
            ;(window as any).__ROLE_PERMISSIONS__ = data.data.config
            setPermsLoaded(true)  // 触发 useMemo 重算 canUpdate/canApprove
          }
        })
        .catch(() => {})
    }
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const fetchUsers = useCallback(async (authToken: string, page: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '10')
      if (search) params.set('search', search)
      if (filterLevel) params.set('level', filterLevel)
      if (filterStatus) params.set('status', filterStatus)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 403 || res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json()
      if (data.success) {
        setUsers(data.data || [])
        setPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 })
      }
    } catch { showMessage('error', '获取会员列表失败') }
    finally { setLoading(false) }
  }, [search, filterLevel, filterStatus, startDate, endDate, sortBy, sortOrder])

  const handleSearch = () => { if (token) fetchUsers(token, 1) }
  const handlePageChange = (p: number) => { if (token && p >= 1 && p <= pagination.totalPages) fetchUsers(token, p) }

  // 查看详情
  const handleViewDetail = async (userId: string) => {
    if (!token) return
    setDetailLoading(true)
    setDetailUser(null)
    // v019: 清空支付密码重置表单状态，防止上一个用户的状态串到新用户
    resetPaymentPasswordResetState()
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setDetailUser(data.data)
        setNewLevel(data.data.level)
        setDetailTab('basic')
      } else { showMessage('error', data.message || '获取详情失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setDetailLoading(false) }
  }

  // 调整等级
  const handleUpdateLevel = async () => {
    if (!token || !detailUser) return
    setSavingLevel(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ level: newLevel }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', `等级已调整为 ${newLevel} - ${LEVEL_NAMES[newLevel]}`)
        setDetailUser(prev => prev ? { ...prev, level: newLevel } : null)
        fetchUsers(token, pagination.page)
      } else { showMessage('error', data.message || '调整失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingLevel(false) }
  }

  // 资金调整
  const handleAdjustBalance = async () => {
    if (!token || !detailUser) return
    if (!canApprove) { showMessage('error', '你没有审批权限,请联系超级管理员'); return }
    const amount = Number(balanceAmount)
    if (!amount || isNaN(amount)) { showMessage('error', '请输入有效的金额'); return }
    // 可用收益只允许增加(正数),不允许减少或为0
    if (balanceType === 'earnings_add' && amount <= 0) {
      showMessage('error', '本次只允许增加可用收益'); return
    }
    // 作废收益只允许正数
    if (balanceType === 'earnings_void' && amount <= 0) {
      showMessage('error', '作废收益金额必须为正数'); return
    }
    // 作废收益不能超过当前可用收益
    if (balanceType === 'earnings_void' && amount > (detailUser.earningsAvailable ?? 0)) {
      showMessage('error', `可用收益不足，当前仅剩 ¥${(detailUser.earningsAvailable ?? 0).toFixed(2)}`); return
    }
    if (balanceReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
    // v68.7:大额(≥1000)弹二次确认
    if (Math.abs(amount) >= LARGE_BALANCE_THRESHOLD) {
      setBalanceConfirm(amount)
      return
    }
    await doAdjustBalance(amount)
  }

  // 实际的余额调整执行
  const doAdjustBalance = async (amount: number) => {
    if (!token || !detailUser) return
    setSavingBalance(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: balanceType, amount, reason: balanceReason.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message || '资金调整成功')
        handleViewDetail(detailUser.id)
        setBalanceAmount('')
        setBalanceReason('')
        fetchUsers(token, pagination.page)
      } else { showMessage('error', data.message || '资金调整失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingBalance(false) }
  }

  // 状态管理
  const handleChangeStatus = async () => {
    if (!token || !detailUser) return
    if (!canUpdate) { showMessage('error', '你没有修改权限,请联系超级管理员'); return }
    if (!newStatus) { showMessage('error', '请选择目标状态'); return }
    if (statusReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
    setSavingStatus(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, reason: statusReason.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message || '状态变更成功')
        setDetailUser(prev => prev ? { ...prev, status: newStatus } : null)
        setStatusReason('')
        fetchUsers(token, pagination.page)
      } else { showMessage('error', data.message || '状态变更失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingStatus(false) }
  }

  // 积分调整（自动联动：调一个字段，其他同步）
  const handleAdjustPoints = async () => {
    if (!token || !detailUser) return
    if (!canApprove) { showMessage('error', '你没有审批权限,请联系超级管理员'); return }
    const amount = Number(pointsAmount)
    if (!amount || isNaN(amount)) { showMessage('error', '请输入有效的调整数值'); return }
    if (pointsReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
    // v68.7:大额(≥5000)积分弹二次确认
    if (Math.abs(amount) >= LARGE_POINTS_THRESHOLD) {
      setPointsConfirm(amount)
      return
    }
    await doAdjustPoints(amount)
  }

  // 实际的积分调整执行
  const doAdjustPoints = async (amount: number) => {
    if (!token || !detailUser) return
    setSavingPoints(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: pointsType, amount, reason: pointsReason.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', data.message || '积分调整成功')
        handleViewDetail(detailUser.id)
        setPointsAmount('')
        setPointsReason('')
        fetchUsers(token, pagination.page)
      } else { showMessage('error', data.message || '积分调整失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingPoints(false) }
  }

  // 基础资料修改
  const handleUpdateProfile = async () => {
    if (!token || !detailUser) return
    const hasChanges = profilePhone || profileNickname || profileEmail || profileRole
    if (!hasChanges) { showMessage('error', '至少需要修改一个字段'); return }
    if ((profilePhone || profileRole) && profileReason.trim().length < 5) {
      showMessage('error', '修改手机号或角色时，原因至少 5 个字'); return
    }
    setSavingProfile(true)
    try {
      const payload: Record<string, string> = {}
      if (profilePhone) payload.phone = profilePhone
      if (profileNickname) payload.nickname = profileNickname
      if (profileEmail) payload.email = profileEmail
      if (profileRole) payload.role = profileRole
      if (profileReason) payload.reason = profileReason.trim()
      const res = await fetch(`/api/admin/users/${detailUser.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '资料修改成功')
        handleViewDetail(detailUser.id)
        setProfilePhone('')
        setProfileNickname('')
        setProfileEmail('')
        setProfileRole('')
        setProfileReason('')
        fetchUsers(token, pagination.page)
      } else { showMessage('error', data.message || '资料修改失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingProfile(false) }
  }

  // 密码重置
  const handleResetPassword = async () => {
    if (!token || !detailUser) return
    if (!canApprove) { showMessage('error', '你没有审批权限,请联系超级管理员'); return }
    if (!resetPassword || resetPassword.length < 8 || resetPassword.length > 20) {
      showMessage('error', '密码长度必须在 8-20 位之间'); return
    }
    if (!/[a-zA-Z]/.test(resetPassword)) { showMessage('error', '密码必须包含字母'); return }
    if (!/[0-9]/.test(resetPassword)) { showMessage('error', '密码必须包含数字'); return }
    if (passwordReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
    // v68.7:密码重置是大动作,任意金额都弹二次确认
    setPasswordConfirm(true)
  }

  // 实际执行密码重置(二次确认后调用)
  const doResetPassword = async () => {
    if (!token || !detailUser) return
    setSavingPassword(true)
    try {
      const res = await fetch(`/api/admin/users/${detailUser.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPassword, reason: passwordReason.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        showMessage('success', '密码已重置，请通知用户')
        setResetPassword('')
        setPasswordReason('')
      } else { showMessage('error', data.message || '密码重置失败') }
    } catch { showMessage('error', '网络错误') }
    finally { setSavingPassword(false) }
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  // 渲染
  return (
    <>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">会员管理</h1>
      </div>

        {/* 消息提示 */}
        {message && (
          <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* 工具栏 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索手机号/昵称..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400" />
            </div>
            <select value={filterLevel} onChange={e => { setFilterLevel(e.target.value); if (token) fetchUsers(token, 1) }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 hover:border-gray-400">
              {LEVEL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); if (token) fetchUsers(token, 1) }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 hover:border-gray-400">
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="frozen">冻结</option>
            </select>
            <button onClick={handleSearch} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap">搜索</button>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">注册时间：</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              <span className="text-gray-400">~</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">排序：</span>
              <select value={`${sortBy}-${sortOrder}`} onChange={e => {
                const [by, order] = e.target.value.split('-')
                setSortBy(by)
                setSortOrder(order)
                if (token) fetchUsers(token, 1)
              }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="createdAt-desc">注册时间↓</option>
                <option value="createdAt-asc">注册时间↑</option>
                <option value="balance-desc">余额↓</option>
                <option value="balance-asc">余额↑</option>
                <option value="level-desc">等级↓</option>
                <option value="level-asc">等级↑</option>
                <option value="directSalesAmount-desc">直推销售额↓</option>
                <option value="directSalesAmount-asc">直推销售额↑</option>
              </select>
            </div>
            <button onClick={() => {
              const data = users.map(u => ({
                手机号: u.phone,
                昵称: u.nickname || '-',
                推荐人: u.referrer ? `${u.referrer.nickname || '-'}(${u.referrer.phone.slice(-4)})` : '-',
                等级: LEVEL_NAMES[u.level],
                状态: u.status === 'active' ? '正常' : '冻结',
                余额: u.balance,
                冻结余额: u.frozenBalance,
                消费余额: u.consumeBalance,
                待结算: u.earningsPending,
                可提现: u.earningsAvailable,
                累计作废: u.earningsVoided,
                总积分: u.totalPoints,
                订单数: u.orderCount,
                订单总额: u.totalOrderAmount,
                直推人数: u.directReferralCount,
                直推经销商: u.directDistributorCount,
                注册时间: formatTime(u.createdAt),
              }))
              const ws = XLSX.utils.json_to_sheet(data)
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, '会员列表')
              XLSX.writeFile(wb, `会员列表_${new Date().toISOString().slice(0, 10)}.xlsx`)
            }} disabled={users.length === 0}
              className="inline-flex items-center gap-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" />导出Excel
            </button>
          </div>
        </div>

        {/* 会员列表 */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /><span className="ml-2 text-gray-500">加载中...</span></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400"><Users className="w-12 h-12 mb-3" /><p>暂无会员数据</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">手机号</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">昵称</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">推荐人</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">等级</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">余额</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">冻结余额</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">消费余额</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">待结算</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">可提现</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">累计作废</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">总积分</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单数</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单总额</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">直推人数</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">直推经销商</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">注册时间</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900">{u.phone}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.nickname || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        {u.referrer ? (
                          <span className="text-gray-700">
                            {u.referrer.nickname || '-'}
                            <span className="text-gray-400 text-xs ml-1">
                              ({u.referrer.phone.slice(-4)})
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.role === 'super_admin' || u.role === 'goods_admin' || u.role === 'finance_admin' || u.role === 'support_admin' || u.role === 'auditor' ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[u.level] || 'bg-gray-100 text-gray-500'}`}>
                            {LEVEL_NAMES[u.level]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {u.status === 'active' ? '正常' : '冻结'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">¥{u.balance.toFixed(2)}</td>
                      <td className="px-3 py-3 text-sm text-gray-500 text-right whitespace-nowrap">¥{formatMoney(u.frozenBalance)}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 text-right whitespace-nowrap">¥{formatMoney(u.consumeBalance)}</td>
                      <td className="px-3 py-3 text-sm text-gray-500 text-right whitespace-nowrap">¥{formatMoney(u.earningsPending)}</td>
                      <td className="px-3 py-3 text-sm text-green-600 text-right whitespace-nowrap">¥{formatMoney(u.earningsAvailable)}</td>
                      <td className="px-3 py-3 text-sm text-red-600 text-right whitespace-nowrap">¥{formatMoney(u.earningsVoided)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.totalPoints}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.orderCount}单</td>
                      <td className="px-4 py-3 text-sm text-gray-700">¥{formatMoney(u.totalOrderAmount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.directReferralCount}人</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.directDistributorCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatTime(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button onClick={() => handleViewDetail(u.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium">
                            <Eye className="w-3.5 h-3.5" />详情
                          </button>
                          <button onClick={() => { setTreeUserId(u.id); setTreeUserName(u.nickname || u.phone.slice(-4)) }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors font-medium">
                            <Network className="w-3.5 h-3.5" />推荐树
                          </button>
                          <Link href={`/admin/users/${u.id}/balance`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors font-medium">
                            <Wallet className="w-3.5 h-3.5" />流水
                          </Link>
                          {u.status === 'active' ? (
                            <button onClick={() => { setDetailUser({ ...u, email: null, parent: null, referrals: [], children: [], orderCount: u.orderCount, totalOrderAmount: u.totalOrderAmount } as UserDetail); setDetailTab('basic'); setNewStatus('frozen'); setOpenSections(prev => ({ ...prev, status: true })) }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium">
                              <Lock className="w-3.5 h-3.5" />冻结
                            </button>
                          ) : (
                            <button onClick={() => { setDetailUser({ ...u, email: null, parent: null, referrals: [], children: [], orderCount: u.orderCount, totalOrderAmount: u.totalOrderAmount } as UserDetail); setDetailTab('basic'); setNewStatus('active'); setOpenSections(prev => ({ ...prev, status: true })) }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors font-medium">
                              <LockOpen className="w-3.5 h-3.5" />解冻
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {!loading && pagination.totalPages > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-500">共 {pagination.total} 个会员，第 {pagination.page}/{pagination.totalPages} 页</div>
              <div className="flex items-center gap-2">
                <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft className="w-4 h-4" />上一页
                </button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter(p => pagination.totalPages <= 7 || Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages)
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1]
                    return (
                      <span key={p} className="flex items-center">
                        {prev && p - prev > 1 && <span className="px-2 text-gray-400">...</span>}
                        <button onClick={() => handlePageChange(p)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${p === pagination.page ? 'bg-blue-600 text-white' : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'}`}>
                          {p}
                        </button>
                      </span>
                    )
                  })}
                <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  下一页<ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      {/* 详情弹窗 */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetailModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            {/* 标题 + 标签页 */}
            <div className="sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">会员详情</h2>
                <button onClick={closeDetailModal} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              {/* 标签页导航 */}
              <div className="px-6 border-b border-gray-200">
                <div className="flex gap-1 overflow-x-auto">
                  {DETAIL_TABS.map(tab => (
                    <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${detailTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* === 基本资料 === */}
              {detailTab === 'basic' && (
                <>
              {/* 基本信息 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><span className="text-xs text-gray-400">手机号</span><p className="text-sm text-gray-900 font-medium">{detailUser.phone}</p></div>
                <div><span className="text-xs text-gray-400">昵称</span><p className="text-sm text-gray-900">{detailUser.nickname || '-'}</p></div>
                <div><span className="text-xs text-gray-400">等级</span><p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[detailUser.level]}`}>{LEVEL_NAMES[detailUser.level]}</span></p></div>
                <div><span className="text-xs text-gray-400">状态</span><p className="text-sm text-gray-900">{detailUser.status === 'active' ? '正常' : detailUser.status}</p></div>
                <div><span className="text-xs text-gray-400">总积分</span><p className="text-sm text-gray-900">{detailUser.totalPoints}</p></div>
                <div><span className="text-xs text-gray-400">可用/锁定</span><p className="text-sm text-gray-900">{detailUser.unlockedPoints} / {detailUser.lockedPoints}</p></div>
              </div>

              {/* 等级调整 */}
              <Section title="等级调整" open={openSections.level} onToggle={() => toggleSection('level')}>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-400">当前等级</span>
                    <p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[detailUser.level]}`}>{detailUser.level} - {LEVEL_NAMES[detailUser.level]}</span></p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">调整至</label>
                      <select value={newLevel} onChange={e => setNewLevel(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        {Array.from({ length: 8 }, (_, i) => (
                          <option key={i} value={i}>{i} - {LEVEL_NAMES[i]}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => {
                      if (!canUpdate) { showMessage('error', '你没有修改权限,请联系超级管理员'); return }
                      handleUpdateLevel()
                    }} disabled={savingLevel || newLevel === detailUser.level || !canUpdate}
                      title={!canUpdate ? '无修改权限' : '调整用户等级'}
                      className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingLevel || newLevel === detailUser.level || !canUpdate ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                      {savingLevel ? '保存中...' : '确认调整'}
                    </button>
                  </div>
                </div>
              </Section>

              {/* 积分调整 */}
              <Section title="积分调整" open={openSections.points} onToggle={() => toggleSection('points')}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">调整字段</label>
                      <select value={pointsType} onChange={e => setPointsType(e.target.value as 'totalPoints' | 'unlockedPoints' | 'lockedPoints')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="totalPoints">总积分</option>
                        <option value="unlockedPoints">可用积分</option>
                        <option value="lockedPoints">锁定积分</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">当前值</label>
                      <p className="text-sm font-medium text-gray-900 py-2">
                        {pointsType === 'totalPoints' ? detailUser.totalPoints :
                         pointsType === 'unlockedPoints' ? detailUser.unlockedPoints : detailUser.lockedPoints}
                      </p>
                      <p className="text-xs text-gray-400">总积分 {detailUser.totalPoints} = 可用 {detailUser.unlockedPoints} + 锁定 {detailUser.lockedPoints}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">调整数量（正数=增加，负数=扣减）</label>
                    <input type="number" value={pointsAmount} onChange={e => setPointsAmount(e.target.value)}
                      placeholder="例如：100 或 -50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">调整原因（至少 5 字）</label>
                    <textarea value={pointsReason} onChange={e => setPointsReason(e.target.value)} rows={2}
                      placeholder="请输入调整原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleAdjustPoints} disabled={savingPoints || !pointsAmount || pointsReason.trim().length < 5 || !canApprove}
                    title={!canApprove ? '无审批权限' : '积分调整'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPoints || !pointsAmount || pointsReason.trim().length < 5 || !canApprove ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-sm'}`}>
                    {savingPoints ? '处理中...' : '确认调整'}
                  </button>
                </div>
              </Section>

              {/* 基础资料修改 */}
              <Section title="基础资料修改" open={openSections.profile} onToggle={() => toggleSection('profile')}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">手机号</label>
                      <input type="text" value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                        placeholder={detailUser.phone}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">昵称</label>
                      <input type="text" value={profileNickname} onChange={e => setProfileNickname(e.target.value)}
                        placeholder={detailUser.nickname || '未设置'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">邮箱</label>
                      <input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)}
                        placeholder={detailUser.email || '未设置'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">角色</label>
                      <select value={profileRole} onChange={e => setProfileRole(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="">不修改</option>
                        <option value="user" selected={detailUser.role === 'user'}>普通用户</option>
                        <option value="auditor" selected={detailUser.role === 'auditor'}>审计员</option>
                        <option value="support_admin" selected={detailUser.role === 'support_admin'}>客服管理员</option>
                        <option value="goods_admin" selected={detailUser.role === 'goods_admin'}>商品管理员</option>
                        <option value="finance_admin" selected={detailUser.role === 'finance_admin'}>财务管理员</option>
                        <option value="super_admin" selected={detailUser.role === 'super_admin'}>超级管理员</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      修改原因{((profilePhone && profilePhone !== detailUser.phone) || profileRole) ? '（必填，≥5字）' : '（选填）'}
                    </label>
                    <textarea value={profileReason} onChange={e => setProfileReason(e.target.value)} rows={2}
                      placeholder="请输入修改原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={() => {
                    if (!canUpdate) { showMessage('error', '你没有修改权限,请联系超级管理员'); return }
                    handleUpdateProfile()
                  }} disabled={savingProfile || !canUpdate}
                    title={!canUpdate ? '无修改权限' : '保存资料修改'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingProfile || !canUpdate ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                    {savingProfile ? '保存中...' : '确认修改'}
                  </button>
                </div>
              </Section>

              {/* 状态管理 */}
              <Section title="状态管理" open={openSections.status} onToggle={() => toggleSection('status')}>
                <div className="space-y-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-xs text-gray-400">当前状态</span>
                      <p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${detailUser.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {detailUser.status === 'active' ? '正常' : detailUser.status === 'frozen' ? '已冻结' : detailUser.status}
                      </span></p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">切换至</label>
                      <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="">请选择</option>
                        <option value="active" disabled={detailUser.status === 'active'}>正常（解封）</option>
                        <option value="frozen" disabled={detailUser.status === 'frozen'}>冻结</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">变更原因（至少 5 字）</label>
                    <textarea value={statusReason} onChange={e => setStatusReason(e.target.value)} rows={2}
                      placeholder="请输入变更原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleChangeStatus} disabled={savingStatus || !newStatus || statusReason.trim().length < 5 || !canUpdate}
                    title={!canUpdate ? '无修改权限' : '变更用户状态'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingStatus || !newStatus || statusReason.trim().length < 5 || !canUpdate ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 shadow-sm'}`}>
                    {savingStatus ? '处理中...' : '确认变更'}
                  </button>
                </div>
              </Section>

              {/* 密码重置 */}
              <Section title="密码重置" open={openSections.password} onToggle={() => toggleSection('password')}>
                <div className="space-y-4">
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-700"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 重置后用户需使用新密码登录，请务必通知用户。</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">新密码（8-20 位，必须包含字母和数字）</label>
                    <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                      placeholder="请输入新密码"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">重置原因（至少 5 字）</label>
                    <textarea value={passwordReason} onChange={e => setPasswordReason(e.target.value)} rows={2}
                      placeholder="请输入重置原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleResetPassword} disabled={savingPassword || !resetPassword || passwordReason.trim().length < 5 || !canApprove}
                    title={!canApprove ? '无审批权限' : '重置用户密码'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPassword || !resetPassword || passwordReason.trim().length < 5 ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 shadow-sm'}`}>
                    {savingPassword ? '处理中...' : '确认重置密码'}
                  </button>
                </div>
              </Section>
                </>
              )}

              {/* === 资金账户 === */}
              {detailTab === 'finance' && (
                <>
                  {/* 余额账户 */}
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wallet className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-gray-900">余额账户</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <span className="text-xs text-gray-400">余额</span>
                        <p className="text-sm font-medium text-gray-900">¥{detailUser.balance.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">冻结余额</span>
                        <p className="text-sm font-medium text-gray-700">¥{detailUser.frozenBalance.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">消费余额</span>
                        <p className="text-sm font-medium text-gray-700">¥{formatMoney(detailUser.consumeBalance ?? 0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* 收益账户 */}
                  <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wallet className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-semibold text-gray-900">收益账户</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <span className="text-xs text-gray-400">可用收益</span>
                        <p className="text-sm font-medium text-green-600">¥{formatMoney(detailUser.earningsAvailable ?? 0)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">冻结收益</span>
                        <p className="text-sm font-medium text-gray-700">¥{formatMoney(detailUser.earningsFrozen ?? 0)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">待结算收益</span>
                        <p className="text-sm font-medium text-gray-700">¥{formatMoney(detailUser.earningsPending ?? 0)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">作废收益</span>
                        <p className="text-sm font-medium text-red-600">¥{formatMoney(detailUser.earningsVoided ?? 0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* 资金调整 */}
                  <Section title="资金调整" open={openSections.balance} onToggle={() => toggleSection('balance')}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">调整字段</label>
                          <select value={balanceType} onChange={e => setBalanceType(e.target.value as 'balance' | 'frozenBalance' | 'earnings_add' | 'earnings_void')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                            <option value="balance">余额</option>
                            <option value="frozenBalance">冻结余额</option>
                            <option value="earnings_add">可用收益（增加）</option>
                            <option value="earnings_void">作废收益</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">当前{balanceType === 'balance' ? '余额' : balanceType === 'frozenBalance' ? '冻结余额' : balanceType === 'earnings_void' ? '可用收益' : '可用收益'}</label>
                          <p className="text-sm font-medium text-gray-900 py-2">¥{(balanceType === 'balance' ? detailUser.balance : balanceType === 'frozenBalance' ? detailUser.frozenBalance : (detailUser.earningsAvailable ?? 0)).toFixed(2)}</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">{balanceType === 'earnings_add' ? '增加金额（只允许正数）' : balanceType === 'earnings_void' ? '作废金额（只允许正数）' : '调整金额（正数=增加，负数=扣减）'}</label>
                        <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                          placeholder={balanceType === 'earnings_add' ? '例如：100' : balanceType === 'earnings_void' ? '例如：40' : '例如：100 或 -50'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                        {balanceType === 'earnings_add' && (
                          <p className="text-xs text-orange-600 mt-1"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 本次只允许增加可用收益，不可减少或作废。</p>
                        )}
                        {balanceType === 'earnings_void' && (
                          <p className="text-xs text-red-600 mt-1"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 作废收益将从可用收益中扣除并计入累计作废，不可逆操作。</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">调整原因（至少 5 字）</label>
                        <textarea value={balanceReason} onChange={e => setBalanceReason(e.target.value)} rows={2}
                          placeholder="请输入调整原因..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                      </div>
                      <button onClick={handleAdjustBalance} disabled={savingBalance || !balanceAmount || balanceReason.trim().length < 5 || !canApprove}
                        title={!canApprove ? '无审批权限' : '余额调整'}
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingBalance || !balanceAmount || balanceReason.trim().length < 5 || !canApprove ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                        {savingBalance ? '处理中...' : '确认调整'}
                      </button>
                    </div>
                  </Section>

                  {/* v018: 支付安全区域 */}
                  <Section title="支付安全" open={openSections.paymentPassword} onToggle={() => toggleSection('paymentPassword')}>
                    <div className="space-y-4">
                      <div className="flex items-center gap-6">
                        <div>
                          <span className="text-xs text-gray-400">支付密码状态</span>
                          <p>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${detailUser.hasPaymentPassword ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {detailUser.hasPaymentPassword ? '已设置' : '未设置'}
                            </span>
                          </p>
                        </div>
                      </div>
                      {detailUser.hasPaymentPassword && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">重置原因（至少 5 字）</label>
                            <textarea value={payPwdResetReason} onChange={e => setPayPwdResetReason(e.target.value)} rows={2}
                              placeholder="请输入重置原因..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">手机号后 4 位（校验用）</label>
                            <input type="text" value={payPwdResetSuffix} onChange={e => setPayPwdResetSuffix(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder={detailUser.phone ? `用户手机号后 4 位: ${detailUser.phone.slice(-4)}` : '请输入 4 位数字'}
                              maxLength={4}
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors ${normalizedSuffix.length === 4 && normalizedSuffix !== actualPhoneSuffix ? 'border-red-400' : 'border-gray-300'}`} />
                            {normalizedSuffix.length === 4 && normalizedSuffix !== actualPhoneSuffix && (
                              <p className="mt-1 text-xs text-red-500">手机号后 4 位不匹配，请核对后重试</p>
                            )}
                          </div>
                          {userRole === 'super_admin' ? (
                            <button onClick={handleResetPaymentPassword} disabled={savingPayPwdReset || !payPwdResetReason.trim() || payPwdResetReason.trim().length < 5 || !suffixMatches}
                              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPayPwdReset || !payPwdResetReason.trim() || payPwdResetReason.trim().length < 5 || !suffixMatches ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-sm'}`}>
                              {savingPayPwdReset ? '处理中...' : '重置支付密码'}
                            </button>
                          ) : (
                            <p className="text-xs text-gray-400">✓ 支付密码状态可查看，仅超级管理员可执行重置操作</p>
                          )}
                        </>
                      )}
                      {!detailUser.hasPaymentPassword && (
                        <p className="text-xs text-gray-400">用户未设置支付密码，无需重置。</p>
                      )}
                    </div>
                  </Section>
                </>
              )}

              {/* === 经营统计 === */}
              {detailTab === 'stats' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><span className="text-xs text-gray-400">升级产品累计</span><p className="text-sm font-medium text-gray-900">{detailUser.upgradeProductCount} 件</p></div>
                  <div><span className="text-xs text-gray-400">直推销售额</span><p className="text-sm font-medium text-gray-900">¥{detailUser.directSalesAmount.toFixed(2)}</p></div>
                  <div><span className="text-xs text-gray-400">直推经销商数</span><p className="text-sm font-medium text-gray-900">{detailUser.directDistributorCount}</p></div>
                  <div><span className="text-xs text-gray-400">直推会员数</span><p className="text-sm font-medium text-gray-900">{detailUser.directReferralCount}</p></div>
                  <div><span className="text-xs text-gray-400">订单总数</span><p className="text-sm font-medium text-gray-900">{detailUser.orderCount}</p></div>
                  <div><span className="text-xs text-gray-400">订单总额</span><p className="text-sm font-medium text-gray-900">¥{detailUser.totalOrderAmount.toFixed(2)}</p></div>
                </div>
              )}

              {/* === 推荐关系 === */}
              {detailTab === 'relation' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-400">推荐人（上级）</span>
                      {detailUser.referrer ? (
                        <p className="text-sm text-gray-900">{detailUser.referrer.phone} <span className="text-gray-400">({detailUser.referrer.nickname || '-'})</span>
                          <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[detailUser.referrer.level]}`}>{LEVEL_NAMES[detailUser.referrer.level]}</span>
                        </p>
                      ) : <p className="text-sm text-gray-400">无</p>}
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">安置上级</span>
                      {detailUser.parent ? (
                        <p className="text-sm text-gray-900">{detailUser.parent.phone} <span className="text-gray-400">({detailUser.parent.nickname || '-'})</span>
                          <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[detailUser.parent.level]}`}>{LEVEL_NAMES[detailUser.parent.level]}</span>
                        </p>
                      ) : <p className="text-sm text-gray-400">无</p>}
                    </div>
                  </div>

                  <Section title={`安置下级 (${detailUser.children.length})`} open={openSections.children} onToggle={() => toggleSection('children')}>
                    {detailUser.children.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">暂无安置下级</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        {detailUser.children.map(c => (
                          <div key={c.id} className="p-3 border border-gray-100 rounded-lg bg-gray-50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-900">{c.phone}</span>
                              {c.position != null && <span className="text-xs text-gray-400">位{c.position}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">{c.nickname || '-'}</span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[c.level]}`}>{LEVEL_NAMES[c.level]}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <div className="flex justify-center">
                    <button onClick={() => { setTreeUserId(detailUser.id); setTreeUserName(detailUser.nickname || detailUser.phone.slice(-4)) }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium text-sm">
                      <Network className="w-4 h-4" />查看推荐关系树
                    </button>
                  </div>
                </>
              )}

              {/* === 直推列表 === */}
              {detailTab === 'referrals' && (
                <>
                  {detailUser.referrals.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">暂无直推会员</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-100">
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">手机号</th>
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">昵称</th>
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">等级</th>
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">注册时间</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {detailUser.referrals.map(r => (
                            <tr key={r.id}>
                              <td className="py-1.5 text-gray-900">{r.phone}</td>
                              <td className="py-1.5 text-gray-700">{r.nickname || '-'}</td>
                              <td className="py-1.5"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[r.level]}`}>{LEVEL_NAMES[r.level]}</span></td>
                              <td className="py-1.5 text-gray-500">{formatTime(r.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 底部 */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end rounded-b-2xl">
              <button onClick={closeDetailModal} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">关闭</button>
            </div>
          </div>
        </div>
      )}

{/* v68.7:大额余额调整二次确认 */}
<ConfirmDialog
open={balanceConfirm !== null}
title={balanceType === 'earnings_void' ? '大额收益作废确认' : '大额余额调整确认'}
mode="emphasize"
message={
<div className="space-y-3">
<p className="leading-relaxed">
你正在调整用户 <span className="font-semibold text-blue-600">{detailUser?.nickname || detailUser?.phone}</span> 的资金:
</p>
<div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-1">
<p>调整字段: <span className="font-semibold text-gray-900">{balanceType === 'balance' ? '余额' : balanceType === 'frozenBalance' ? '冻结余额' : balanceType === 'earnings_void' ? '作废收益' : '可用收益'}</span></p>
{balanceType === 'earnings_void' ? (
<>
<p>作废金额: <span className="font-bold text-red-600 text-lg">¥{Math.abs(balanceConfirm || 0).toFixed(2)}</span></p>
<p>当前可用收益: <span className="text-gray-700">¥{(detailUser?.earningsAvailable ?? 0).toFixed(2)}</span></p>
<p>作废后可用收益: <span className="font-semibold text-orange-600">¥{((detailUser?.earningsAvailable ?? 0) - Math.abs(balanceConfirm || 0)).toFixed(2)}</span></p>
<p>作废后累计作废: <span className="font-semibold text-red-600">¥{((detailUser?.earningsVoided ?? 0) + Math.abs(balanceConfirm || 0)).toFixed(2)}</span></p>
</>
) : (
<>
<p>调整金额: <span className="font-bold text-red-600 text-lg">¥{Math.abs(balanceConfirm || 0).toFixed(2)} {(balanceConfirm || 0) > 0 ? '增加' : '扣减'}</span></p>
<p>调整前: <span className="text-gray-700">¥{(balanceType === 'balance' ? (detailUser?.balance ?? 0) : balanceType === 'frozenBalance' ? (detailUser?.frozenBalance ?? 0) : (detailUser?.earningsAvailable ?? 0)).toFixed(2)}</span></p>
<p>调整后: <span className="font-semibold text-orange-600">¥{((balanceType === 'balance' ? (detailUser?.balance ?? 0) : balanceType === 'frozenBalance' ? (detailUser?.frozenBalance ?? 0) : (detailUser?.earningsAvailable ?? 0)) + (balanceConfirm || 0)).toFixed(2)}</span></p>
</>
)}
<p>原因: <span className="text-gray-700">{balanceReason}</span></p>
</div>
<p className="text-red-600 text-xs"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> {balanceType === 'earnings_void' ? '收益作废会从可用收益中扣除并计入累计作废,不可逆操作,请确认无误后再提交。' : '余额调整会在用户账上直接生效,请确认无误后再提交。'}</p>
</div>
}
confirmText={balanceType === 'earnings_void' ? '我已确认,执行作废' : '我已确认,执行调整'}
loading={savingBalance}
onConfirm={async () => {
const amt = balanceConfirm!
setBalanceConfirm(null)
await doAdjustBalance(amt)
}}
onCancel={() => setBalanceConfirm(null)}
/>

      {/* v68.7:大额积分调整二次确认 */}
      <ConfirmDialog
        open={pointsConfirm !== null}
        title="大额积分调整确认"
        mode="emphasize"
        message={
          <div className="space-y-3">
            <p className="leading-relaxed">
              你正在调整用户 <span className="font-semibold text-purple-600">{detailUser?.nickname || detailUser?.phone}</span> 的积分:
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-1">
              <p>调整字段: <span className="font-semibold text-gray-900">{pointsType === 'totalPoints' ? '总积分' : pointsType === 'unlockedPoints' ? '可用积分' : '锁定积分'}</span></p>
              <p>调整数量: <span className="font-bold text-red-600 text-lg">{Math.abs(pointsConfirm || 0).toLocaleString()} 积分 {(pointsConfirm || 0) > 0 ? '增加' : '扣减'}</span></p>
              <p>原因: <span className="text-gray-700">{pointsReason}</span></p>
            </div>
            <p className="text-red-600 text-xs"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 积分调整会同步联动总积分/可用积分/锁定积分三个字段。</p>
          </div>
        }
        confirmText="我已确认,执行调整"
        loading={savingPoints}
        onConfirm={async () => {
          const amt = pointsConfirm!
          setPointsConfirm(null)
          await doAdjustPoints(amt)
        }}
        onCancel={() => setPointsConfirm(null)}
      />

      {/* v68.7:密码重置二次确认(任何金额都弹) */}
      <ConfirmDialog
        open={passwordConfirm}
        title="重置用户密码确认"
        mode="emphasize"
        message={
          <div className="space-y-3">
            <p className="leading-relaxed">
              你正在重置用户 <span className="font-semibold text-orange-600">{detailUser?.nickname || detailUser?.phone}</span> 的登录密码。
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm space-y-1">
              <p>用户: <span className="font-mono">{detailUser?.phone}</span></p>
              <p>新密码: <span className="font-mono text-gray-900">{'*'.repeat(resetPassword.length)}</span> ({resetPassword.length} 位)</p>
              <p>原因: <span className="text-gray-700">{passwordReason}</span></p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
              <p><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 重置后原密码立即失效,该用户需使用新密码重新登录。</p>
              <p className="mt-1">请务必通过短信/站内信等渠道告知用户新密码。</p>
            </div>
          </div>
        }
        confirmText="我已确认,执行重置"
        loading={savingPassword}
        onConfirm={async () => {
          setPasswordConfirm(false)
          await doResetPassword()
        }}
        onCancel={() => setPasswordConfirm(false)}
      />

      {/* v018: 支付密码重置二次确认 */}
      <ConfirmDialog
        open={showPayPwdConfirm}
        title="重置支付密码确认"
        mode="emphasize"
        message={
          <div className="space-y-3">
            <p className="leading-relaxed">
              你正在重置用户 <span className="font-semibold text-orange-600">{detailUser?.nickname || detailUser?.phone}</span> 的支付密码。
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm space-y-1">
              <p>用户: <span className="font-mono">{detailUser?.phone}</span></p>
              <p>原因: <span className="text-gray-700">{payPwdResetReason}</span></p>
              <p>手机号后 4 位: <span className="font-mono text-gray-900">{payPwdResetSuffix}</span></p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
              <p><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 重置后用户需要重新设置支付密码。</p>
              <p className="mt-1">请通过站内信或其他渠道通知用户。</p>
            </div>
          </div>
        }
        confirmText="我已确认，执行重置"
        loading={savingPayPwdReset}
        onConfirm={async () => {
          setShowPayPwdConfirm(false)
          await doResetPaymentPassword()
        }}
        onCancel={() => setShowPayPwdConfirm(false)}
      />

      {/* 加载中遮罩 */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" /><span className="text-gray-600">加载中...</span>
          </div>
        </div>
      )}
      {/* v27 浮动推荐树面板 */}
      {treeUserId && (
        <ReferralTreePanel
          userId={treeUserId}
          userName={treeUserName}
          onClose={() => setTreeUserId(null)}
        />
      )}
    </>
  )
}

// ---- 折叠区块组件 ----

function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <span className="font-medium text-sm text-gray-900">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 py-3 bg-white">{children}</div>}
    </div>
  )
}