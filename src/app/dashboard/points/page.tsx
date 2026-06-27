'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Unlock, ShoppingCart, Send, Ban,
  ArrowLeft, ChevronLeft, ChevronRight, Coins,
  Lock, ArrowDownToLine, LogIn, X, Loader2
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'

// ---- 类型 ----

interface PointsRecord {
  id: string
  type: string
  amount: number
  totalPoints: number
  unlockedPoints: number
  lockedPoints: number
  sourceId?: string | null
  description?: string | null
  relatedUserId?: string | null
  createdAt: string
}

interface UserInfo {
  totalPoints: number
  unlockedPoints: number
  lockedPoints: number
  phone?: string
}

interface RecipientInfo {
  id: string
  phone: string
  nickname: string | null
}

// ---- 类型配置 ----

const TYPE_CONFIG: Record<string, {
  name: string
  iconBg: string
  iconColor: string
  icon: React.ReactNode
}> = {
  earn: {
    name: '获得积分',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    icon: <TrendingUp className="w-5 h-5" />,
  },
  unlock: {
    name: '解锁积分',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    icon: <Unlock className="w-5 h-5" />,
  },
  use: {
    name: '使用积分',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    icon: <ShoppingCart className="w-5 h-5" />,
  },
  transfer_in: {
    name: '转入积分',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    icon: <LogIn className="w-5 h-5" />,
  },
  transfer_out: {
    name: '转出积分',
    iconBg: 'bg-pink-100',
    iconColor: 'text-pink-600',
    icon: <Send className="w-5 h-5" />,
  },
  void: {
    name: '积分作废',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
    icon: <Ban className="w-5 h-5" />,
  },
}

// 过滤 tab 配置
const FILTER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'earn', label: '获得' },
  { key: 'unlock', label: '解锁' },
  { key: 'use', label: '使用' },
  { key: 'transfer_in', label: '转入' },
  { key: 'transfer_out', label: '转出' },
] as const

// 手机号脱敏
function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

// 手续费比例（与后端默认值保持一致）
const FEE_PERCENT = 10

// ---- 主组件 ----

export default function PointsPage() {
  const router = useRouter()
  const [records, setRecords] = useState<PointsRecord[]>([])
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [token, setToken] = useState('')
  const pageSize = 10

  // 转赠弹窗状态
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [toUserPhone, setToUserPhone] = useState('')
  const [transferPoints, setTransferPoints] = useState('')
  const [recipientInfo, setRecipientInfo] = useState<RecipientInfo | null>(null)
  const [phoneChecking, setPhoneChecking] = useState(false)
  const [phoneChecked, setPhoneChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchAll(storedToken)
  }, [router])

  const fetchAll = useCallback(async (authToken: string) => {
    try {
      const [userRes, pointsRes] = await Promise.allSettled([
        fetch('/api/users/me', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/points', { headers: { Authorization: `Bearer ${authToken}` } }),
      ])

      if (userRes.status === 'fulfilled' && userRes.value.ok) {
        const data = await userRes.value.json()
        if (data.success) {
          setUser({
            totalPoints: data.data.totalPoints ?? 0,
            unlockedPoints: data.data.unlockedPoints ?? 0,
            lockedPoints: data.data.lockedPoints ?? 0,
            phone: data.data.phone,
          })
        }
      }

      if (pointsRes.status === 'fulfilled' && pointsRes.value.ok) {
        const data = await pointsRes.value.json()
        if (data.success) setRecords(data.data || [])
      }
    } catch (err) {
      console.error('获取积分数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 接收方手机号实时校验（debounce 500ms）
  useEffect(() => {
    if (toUserPhone.length !== 11) {
      setRecipientInfo(null)
      setPhoneChecked(false)
      setPhoneChecking(false)
      return
    }

    // 防自转：手机号与当前用户一致
    if (user?.phone && toUserPhone === user.phone) {
      setRecipientInfo(null)
      setPhoneChecked(true)
      setPhoneChecking(false)
      return
    }

    setPhoneChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/lookup?phone=${toUserPhone}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setRecipientInfo(data.success ? data.data : null)
          setPhoneChecked(true)
        } else {
          setRecipientInfo(null)
          setPhoneChecked(true)
        }
      } catch (err) {
        console.error('查询用户失败:', err)
        setRecipientInfo(null)
        setPhoneChecked(true)
      } finally {
        setPhoneChecking(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [toUserPhone, token, user?.phone])

  // 手续费计算
  const transferPointsNum = parseInt(transferPoints) || 0
  const feeAmount = Math.floor((transferPointsNum * FEE_PERCENT) / 100)
  const totalDeduction = transferPointsNum + feeAmount
  const isSelfTransfer = user?.phone !== undefined && toUserPhone === user.phone
  const canSubmit =
    !!recipientInfo &&
    !isSelfTransfer &&
    transferPointsNum > 0 &&
    totalDeduction <= (user?.unlockedPoints ?? 0)

  // 提交转赠
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !recipientInfo) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/points/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          toUserPhone,
          points: transferPointsNum,
        }),
      })

      const data = await res.json()
      if (data.success) {
        const recipientName = recipientInfo.nickname || maskPhone(recipientInfo.phone)
        toast.success(`成功转赠 ${transferPointsNum} 积分给 ${recipientName}（含手续费 ${feeAmount} 积分）`)
        setShowTransferModal(false)
        setToUserPhone('')
        setTransferPoints('')
        setRecipientInfo(null)
        setPhoneChecked(false)
        fetchAll(token) // 刷新积分列表
      } else {
        toast.error(data.error || '转赠失败')
      }
    } catch (err) {
      console.error('转赠失败:', err)
      toast.error('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  // 关闭弹窗时重置状态
  const closeModal = () => {
    setShowTransferModal(false)
    setToUserPhone('')
    setTransferPoints('')
    setRecipientInfo(null)
    setPhoneChecked(false)
    setPhoneChecking(false)
  }

  // 每日解锁额度：从 unlock 类型记录推算（取最近一条 unlock 记录的 amount）
  const dailyUnlock = records
    .filter((r) => r.type === 'unlock')
    .reduce((max, r) => Math.max(max, r.amount), 0)

  // 按 tab 过滤记录
  const filteredRecords = activeFilter === 'all'
    ? records
    : records.filter((r) => r.type === activeFilter)

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const paged = filteredRecords.slice((page - 1) * pageSize, page * pageSize)

  // 切换 tab 时重置页码
  useEffect(() => {
    setPage(1)
  }, [activeFilter])

  const formatRelativeTime = (s: string) => {
    const diff = Date.now() - new Date(s).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}天前`
    return new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // ---- 加载态 ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-base p-5 animate-pulse">
                <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-8 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-base p-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-gray-200 rounded" />
                    <div className="h-3 w-1/2 bg-gray-200 rounded" />
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
            <Coins className="w-6 h-6 text-secondary" />
            积分管理
          </h1>
          <span className="text-sm text-gray-400 ml-1">共 {filteredRecords.length} 条</span>
        </div>

        {/* 顶部积分卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-400">总积分</span>
            </div>
            <p className="text-2xl font-bold text-primary">{user?.totalPoints ?? 0}</p>
          </div>
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <Unlock className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-400">可用积分</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{user?.unlockedPoints ?? 0}</p>
          </div>
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-gray-400">锁定积分</span>
            </div>
            <p className="text-2xl font-bold text-orange-500">{user?.lockedPoints ?? 0}</p>
          </div>
          <div className="card-base p-5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownToLine className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-400">每日解锁</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{dailyUnlock}<span className="text-sm font-normal text-gray-400 ml-1">分/天</span></p>
          </div>
        </div>

        {/* 积分明细 + 过滤 tab */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-lg font-semibold text-gray-900">积分明细</h3>
          {/* 转出积分 tab 时显示发起转赠按钮 */}
          {activeFilter === 'transfer_out' && (
            <button
              onClick={() => setShowTransferModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
              发起转赠
            </button>
          )}
        </div>

        {/* 过滤 tabs */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeFilter === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-500 hover:text-primary shadow-sm'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {paged.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {paged.map((record) => (
              <PointsCard key={record.id} record={record} formatRelativeTime={formatRelativeTime} />
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

      {/* ===== 积分转赠弹窗 ===== */}
      {showTransferModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                积分转赠
              </h3>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransfer}>
              {/* 接收方手机号 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  接收方手机号
                </label>
                <input
                  type="text"
                  value={toUserPhone}
                  onChange={(e) => {
                    setToUserPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                  }}
                  placeholder="请输入接收方手机号"
                  maxLength={11}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                {/* 校验状态 */}
                {phoneChecking && (
                  <div className="mt-2 text-sm text-gray-400 flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在查询用户...
                  </div>
                )}
                {phoneChecked && !phoneChecking && recipientInfo && (
                  <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                    ✓ 接收方：{recipientInfo.nickname || '未设置昵称'} ({maskPhone(recipientInfo.phone)})
                  </div>
                )}
                {phoneChecked && !phoneChecking && !recipientInfo && isSelfTransfer && (
                  <div className="mt-2 text-sm text-red-500">
                    ✗ 不能转给自己
                  </div>
                )}
                {phoneChecked && !phoneChecking && !recipientInfo && !isSelfTransfer && (
                  <div className="mt-2 text-sm text-red-500">
                    ✗ 用户不存在
                  </div>
                )}
              </div>

              {/* 转赠积分 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  转赠积分
                </label>
                <input
                  type="number"
                  value={transferPoints}
                  onChange={(e) => setTransferPoints(e.target.value)}
                  placeholder={`最多可转赠 ${user?.unlockedPoints ?? 0} 积分`}
                  min={1}
                  max={user?.unlockedPoints ?? 0}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              {/* 手续费预览 */}
              {transferPointsNum > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1.5">
                  <div className="flex justify-between text-gray-600">
                    <span>转赠积分</span>
                    <span>{transferPointsNum} 积分</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span>手续费（{FEE_PERCENT}%）</span>
                    <span>{feeAmount} 积分</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-1.5 border-t border-gray-200 text-gray-900">
                    <span>实际扣除</span>
                    <span>{totalDeduction} 积分</span>
                  </div>
                  {totalDeduction > (user?.unlockedPoints ?? 0) && (
                    <div className="text-red-500 text-xs pt-1">
                      可用积分不足，当前可用 {user?.unlockedPoints ?? 0} 积分
                    </div>
                  )}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      转赠中...
                    </>
                  ) : (
                    '确认转赠'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

// ---- 积分卡片 ----

function PointsCard({
  record,
  formatRelativeTime,
}: {
  record: PointsRecord
  formatRelativeTime: (s: string) => string
}) {
  const conf = TYPE_CONFIG[record.type] || {
    name: record.type,
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
    icon: <Coins className="w-5 h-5" />,
  }

  const isPositive = record.amount > 0

  // 描述文案
  const getDescription = () => {
    if (record.description) return record.description
    switch (record.type) {
      case 'earn': return '购买产品获得积分'
      case 'unlock': return '每日解锁'
      case 'use': return '订单积分抵扣'
      case 'transfer_in': return '收到积分转赠'
      case 'transfer_out': return '转赠积分给好友'
      case 'void': return '积分作废'
      default: return ''
    }
  }

  return (
    <div className="card-base p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        {/* 左侧图标 */}
        <div className={`w-10 h-10 rounded-full ${conf.iconBg} ${conf.iconColor} flex items-center justify-center flex-shrink-0`}>
          {conf.icon}
        </div>

        {/* 中部信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{conf.name}</span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{getDescription()}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-300">{formatRelativeTime(record.createdAt)}</span>
            <span className="text-xs text-gray-300">
              可用 {record.unlockedPoints} | 锁定 {record.lockedPoints}
            </span>
          </div>
        </div>

        {/* 右侧积分变化 */}
        <div className="text-right flex-shrink-0">
          <p className={`text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{record.amount}
          </p>
          <p className="text-xs text-gray-400">余额 {record.totalPoints}</p>
        </div>
      </div>
    </div>
  )
}

// ---- 空状态 ----

function EmptyState() {
  return (
    <div className="card-base p-16 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Coins className="w-10 h-10 text-gray-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-500 mb-2">暂无积分记录</h3>
      <p className="text-sm text-gray-400 mb-6">购买产品即可获得积分奖励</p>
      <Link
        href="/products"
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-600 transition-colors shadow-md shadow-primary/25"
      >
        去购物
      </Link>
    </div>
  )
}
