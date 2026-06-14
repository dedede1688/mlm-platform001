'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Users, Search, Loader2, ChevronLeft, ChevronRight,
  X, Eye, Network, ChevronDown, ChevronUp
} from 'lucide-react'

// ---- 类型定义 ----

interface UserRow {
  id: string
  phone: string
  nickname: string | null
  level: number
  balance: number
  frozenBalance: number
  totalPoints: number
  unlockedPoints: number
  lockedPoints: number
  referrerId: string | null
  parentId: string | null
  position: number | null
  upgradeProductCount: number
  directSalesAmount: number
  directDistributorCount: number
  directReferralCount: number
  status: string
  createdAt: string
  updatedAt: string
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

// ---- 主组件 ----

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  // 搜索与筛选
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('')

  // 详情弹窗
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 等级调整
  const [newLevel, setNewLevel] = useState<number>(0)
  const [savingLevel, setSavingLevel] = useState(false)

  // 资金调整
  const [balanceType, setBalanceType] = useState<'balance' | 'frozenBalance'>('balance')
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

  // 密码重置
  const [resetPassword, setResetPassword] = useState<string>('')
  const [passwordReason, setPasswordReason] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // 展开区块
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    stats: true, relation: true, referrals: true, children: false, level: false, balance: false, points: true, profile: false, password: true, status: false,
  })

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      fetchUsers(storedToken, 1)
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
  }, [search, filterLevel])

  const handleSearch = () => { if (token) fetchUsers(token, 1) }
  const handlePageChange = (p: number) => { if (token && p >= 1 && p <= pagination.totalPages) fetchUsers(token, p) }

  // 查看详情
  const handleViewDetail = async (userId: string) => {
    if (!token) return
    setDetailLoading(true)
    setDetailUser(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setDetailUser(data.data)
        setNewLevel(data.data.level)
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
    const amount = Number(balanceAmount)
    if (!amount || isNaN(amount)) { showMessage('error', '请输入有效的金额'); return }
    if (balanceReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
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
        // 刷新详情以更新余额显示
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
    const amount = Number(pointsAmount)
    if (!amount || isNaN(amount)) { showMessage('error', '请输入有效的调整数值'); return }
    if (pointsReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
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
    if (!resetPassword || resetPassword.length < 8 || resetPassword.length > 20) {
      showMessage('error', '密码长度必须在 8-20 位之间'); return
    }
    if (!/[a-zA-Z]/.test(resetPassword)) { showMessage('error', '密码必须包含字母'); return }
    if (!/[0-9]/.test(resetPassword)) { showMessage('error', '密码必须包含数字'); return }
    if (passwordReason.trim().length < 5) { showMessage('error', '原因至少 5 个字'); return }
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
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索手机号/昵称..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400" />
            </div>
            <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 hover:border-gray-400">
              {LEVEL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button onClick={handleSearch} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap">搜索</button>
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">等级</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">余额</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">总积分</th>
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
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[u.level] || 'bg-gray-100 text-gray-500'}`}>
                          {LEVEL_NAMES[u.level]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">¥{u.balance.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.totalPoints}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{u.directDistributorCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatTime(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleViewDetail(u.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium">
                            <Eye className="w-3.5 h-3.5" />详情
                          </button>
                          <Link href={`/admin/users/${u.id}/tree`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors font-medium">
                            <Network className="w-3.5 h-3.5" />推荐树
                          </Link>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* 标题 */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">会员详情</h2>
              <button onClick={() => setDetailUser(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><span className="text-xs text-gray-400">手机号</span><p className="text-sm text-gray-900 font-medium">{detailUser.phone}</p></div>
                <div><span className="text-xs text-gray-400">昵称</span><p className="text-sm text-gray-900">{detailUser.nickname || '-'}</p></div>
                <div><span className="text-xs text-gray-400">等级</span><p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[detailUser.level]}`}>{LEVEL_NAMES[detailUser.level]}</span></p></div>
                <div><span className="text-xs text-gray-400">状态</span><p className="text-sm text-gray-900">{detailUser.status === 'active' ? '正常' : detailUser.status}</p></div>
                <div><span className="text-xs text-gray-400">余额</span><p className="text-sm text-gray-900">¥{detailUser.balance.toFixed(2)}</p></div>
                <div><span className="text-xs text-gray-400">冻结余额</span><p className="text-sm text-gray-900">¥{detailUser.frozenBalance.toFixed(2)}</p></div>
                <div><span className="text-xs text-gray-400">总积分</span><p className="text-sm text-gray-900">{detailUser.totalPoints}</p></div>
                <div><span className="text-xs text-gray-400">可用/锁定</span><p className="text-sm text-gray-900">{detailUser.unlockedPoints} / {detailUser.lockedPoints}</p></div>
              </div>

              {/* 统计信息 */}
              <Section title="经营统计" open={openSections.stats} onToggle={() => toggleSection('stats')}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><span className="text-xs text-gray-400">升级产品累计</span><p className="text-sm font-medium text-gray-900">{detailUser.upgradeProductCount} 件</p></div>
                  <div><span className="text-xs text-gray-400">直推销售额</span><p className="text-sm font-medium text-gray-900">¥{detailUser.directSalesAmount.toFixed(2)}</p></div>
                  <div><span className="text-xs text-gray-400">直推经销商数</span><p className="text-sm font-medium text-gray-900">{detailUser.directDistributorCount}</p></div>
                  <div><span className="text-xs text-gray-400">直推会员数</span><p className="text-sm font-medium text-gray-900">{detailUser.directReferralCount}</p></div>
                  <div><span className="text-xs text-gray-400">订单总数</span><p className="text-sm font-medium text-gray-900">{detailUser.orderCount}</p></div>
                  <div><span className="text-xs text-gray-400">订单总额</span><p className="text-sm font-medium text-gray-900">¥{detailUser.totalOrderAmount.toFixed(2)}</p></div>
                </div>
              </Section>

              {/* 推荐关系 */}
              <Section title="推荐关系" open={openSections.relation} onToggle={() => toggleSection('relation')}>
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
              </Section>

              {/* 直推列表 */}
              <Section title={`直推列表 (${detailUser.referrals.length})`} open={openSections.referrals} onToggle={() => toggleSection('referrals')}>
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
              </Section>

              {/* 安置下级 */}
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
                    <button onClick={handleUpdateLevel} disabled={savingLevel || newLevel === detailUser.level}
                      className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingLevel || newLevel === detailUser.level ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
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
                  <button onClick={handleAdjustPoints} disabled={savingPoints || !pointsAmount || pointsReason.trim().length < 5}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPoints || !pointsAmount || pointsReason.trim().length < 5 ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-sm'}`}>
                    {savingPoints ? '处理中...' : '确认调整'}
                  </button>
                </div>
              </Section>

              {/* 密码重置 */}
              <Section title="密码重置" open={openSections.password} onToggle={() => toggleSection('password')}>
                <div className="space-y-4">
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-700">⚠️ 重置后用户需使用新密码登录，请务必通知用户。</p>
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
                  <button onClick={handleResetPassword} disabled={savingPassword || !resetPassword || passwordReason.trim().length < 5}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPassword || !resetPassword || passwordReason.trim().length < 5 ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 shadow-sm'}`}>
                    {savingPassword ? '处理中...' : '确认重置密码'}
                  </button>
                </div>
              </Section>

              {/* 资金调整 */}
              <Section title="资金调整" open={openSections.balance} onToggle={() => toggleSection('balance')}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">调整字段</label>
                      <select value={balanceType} onChange={e => setBalanceType(e.target.value as 'balance' | 'frozenBalance')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="balance">余额</option>
                        <option value="frozenBalance">冻结余额</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">当前{balanceType === 'balance' ? '余额' : '冻结余额'}</label>
                      <p className="text-sm font-medium text-gray-900 py-2">¥{(balanceType === 'balance' ? detailUser.balance : detailUser.frozenBalance).toFixed(2)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">调整金额（正数=增加，负数=扣减）</label>
                    <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                      placeholder="例如：100 或 -50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">调整原因（至少 5 字）</label>
                    <textarea value={balanceReason} onChange={e => setBalanceReason(e.target.value)} rows={2}
                      placeholder="请输入调整原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleAdjustBalance} disabled={savingBalance || !balanceAmount || balanceReason.trim().length < 5}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingBalance || !balanceAmount || balanceReason.trim().length < 5 ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                    {savingBalance ? '处理中...' : '确认调整'}
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
                  <button onClick={handleUpdateProfile} disabled={savingProfile}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingProfile ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
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
                  <button onClick={handleChangeStatus} disabled={savingStatus || !newStatus || statusReason.trim().length < 5}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingStatus || !newStatus || statusReason.trim().length < 5 ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 shadow-sm'}`}>
                    {savingStatus ? '处理中...' : '确认变更'}
                  </button>
                </div>
              </Section>

              {/* 推荐树按钮 */}
              <div className="flex justify-center">
                <Link href={`/admin/users/${detailUser.id}/tree`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium text-sm">
                  <Network className="w-4 h-4" />查看推荐关系树
                </Link>
              </div>
            </div>

            {/* 底部 */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end rounded-b-2xl">
              <button onClick={() => setDetailUser(null)} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 加载中遮罩 */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" /><span className="text-gray-600">加载中...</span>
          </div>
        </div>
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