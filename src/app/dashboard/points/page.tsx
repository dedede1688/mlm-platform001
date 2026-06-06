'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Unlock, ShoppingCart, Send, Ban,
  ArrowLeft, ChevronLeft, ChevronRight, Coins,
  Lock, ArrowDownToLine, LogIn
} from 'lucide-react'

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

// ---- 主组件 ----

export default function PointsPage() {
  const router = useRouter()
  const [records, setRecords] = useState<PointsRecord[]>([])
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    fetchAll(storedToken)
  }, [router])

  const fetchAll = async (authToken: string) => {
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
  }

  // 每日解锁额度：从 unlock 类型记录推算（取最近一条 unlock 记录的 amount）
  const dailyUnlock = records
    .filter((r) => r.type === 'unlock')
    .reduce((max, r) => Math.max(max, r.amount), 0)

  // 分页
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
  const paged = records.slice((page - 1) * pageSize, page * pageSize)

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
          <span className="text-sm text-gray-400 ml-1">共 {records.length} 条</span>
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

        {/* 积分明细 */}
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">积分明细</h3>
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