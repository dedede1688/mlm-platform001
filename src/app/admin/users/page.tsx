'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils/format'

import {
  Users, Search, Loader2, ChevronLeft, ChevronRight,
  X, Eye, Network, Wallet,
  Lock, LockOpen, Download, AlertTriangle
} from 'lucide-react'
import { hasPermission } from '@/lib/admin-permissions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { getAuthToken, getAuthUserRole } from '@/lib/utils/auth-token'
import dynamic from 'next/dynamic'

import UserTable from './_components/UserTable'

const ReferralTreePanel = dynamic(() => import('@/components/ReferralTreePanel'), { ssr: false })
const UserDetailModal = dynamic(() => import('./_components/UserDetailModal'), { ssr: false })
import Section from './_components/Section'

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
    const storedToken = getAuthToken()
    if (storedToken) {
      setToken(storedToken)
      fetchUsers(storedToken, 1)
    }
    // v68.7:解析当前用户角色
    setUserRole(getAuthUserRole())
    // v68.8:Page 自己也 fetch role-permissions(避免 layout 不重 mount 导致 window 过期)
    if (storedToken) {
      fetch('/api/admin/role-permissions', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data?.success && data?.data?.config) {
            ;(window as { __ROLE_PERMISSIONS__?: Record<string, string[]> }).__ROLE_PERMISSIONS__ = data.data.config
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

      {/* 用户表格 */}
      <UserTable
        users={users}
        pagination={pagination}
        loading={loading}
        search={search}
        setSearch={setSearch}
        filterLevel={filterLevel}
        setFilterLevel={setFilterLevel}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        handleSearch={handleSearch}
        handlePageChange={handlePageChange}
        onViewDetail={handleViewDetail}
        onOpenTree={(userId, userName) => { setTreeUserId(userId); setTreeUserName(userName) }}
      />
      {/* 详情弹窗 */}
      {detailUser && (
        <UserDetailModal
          detailUser={detailUser}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          closeDetailModal={closeDetailModal}
          openSections={openSections}
          toggleSection={toggleSection}
          newLevel={newLevel}
          setNewLevel={setNewLevel}
          savingLevel={savingLevel}
          handleUpdateLevel={handleUpdateLevel}
          balanceType={balanceType}
          setBalanceType={setBalanceType}
          balanceAmount={balanceAmount}
          setBalanceAmount={setBalanceAmount}
          balanceReason={balanceReason}
          setBalanceReason={setBalanceReason}
          savingBalance={savingBalance}
          handleAdjustBalance={handleAdjustBalance}
          pointsType={pointsType}
          setPointsType={setPointsType}
          pointsAmount={pointsAmount}
          setPointsAmount={setPointsAmount}
          pointsReason={pointsReason}
          setPointsReason={setPointsReason}
          savingPoints={savingPoints}
          handleAdjustPoints={handleAdjustPoints}
          profilePhone={profilePhone}
          setProfilePhone={setProfilePhone}
          profileNickname={profileNickname}
          setProfileNickname={setProfileNickname}
          profileEmail={profileEmail}
          setProfileEmail={setProfileEmail}
          profileRole={profileRole}
          setProfileRole={setProfileRole}
          profileReason={profileReason}
          setProfileReason={setProfileReason}
          savingProfile={savingProfile}
          handleUpdateProfile={handleUpdateProfile}
          resetPassword={resetPassword}
          setResetPassword={setResetPassword}
          passwordReason={passwordReason}
          setPasswordReason={setPasswordReason}
          savingPassword={savingPassword}
          handleResetPassword={handleResetPassword}
          newStatus={newStatus}
          setNewStatus={setNewStatus}
          statusReason={statusReason}
          setStatusReason={setStatusReason}
          savingStatus={savingStatus}
          handleChangeStatus={handleChangeStatus}
          payPwdResetReason={payPwdResetReason}
          setPayPwdResetReason={setPayPwdResetReason}
          payPwdResetSuffix={payPwdResetSuffix}
          setPayPwdResetSuffix={setPayPwdResetSuffix}
          savingPayPwdReset={savingPayPwdReset}
          handleResetPaymentPassword={handleResetPaymentPassword}
          actualPhoneSuffix={actualPhoneSuffix}
          normalizedSuffix={normalizedSuffix}
          suffixMatches={suffixMatches}
          userRole={userRole}
          canUpdate={canUpdate}
          canApprove={canApprove}
          LARGE_BALANCE_THRESHOLD={LARGE_BALANCE_THRESHOLD}
          LARGE_POINTS_THRESHOLD={LARGE_POINTS_THRESHOLD}
          showMessage={showMessage}
          formatTime={formatTime}
          setTreeUserId={setTreeUserId}
          setTreeUserName={setTreeUserName}
        />
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
