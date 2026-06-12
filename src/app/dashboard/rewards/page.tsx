'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  UserPlus, BadgeCheck, PiggyBank, TrendingUp,
  ArrowLeft, ChevronLeft, ChevronRight, Package,
  Calendar, Coins, Users
} from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

// ---- 类型 ----

interface Reward {
  id: string
  type: string
  amount: number
  orderId: string
  fromUserId?: string | null
  level?: number | null
  status: string
  createdAt: string
  order?: {
    orderNo: string
    payAmount: number
  } | null
}

interface RewardStats {
  totalAmount: number
  referralTotal: number
  brandBonusTotal: number
  teamTotal: number
  dividendTotal: number
  totalCount: number
}

// ---- 奖励类型配置 ----

type RewardTypeKey = 'all' | 'referral' | 'team' | 'brand_bonus' | 'dividend'

const TYPE_TABS: { key: RewardTypeKey; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'referral', label: '直推奖', icon: <UserPlus className="w-4 h-4" /> },
  { key: 'team', label: '团队奖', icon: <Users className="w-4 h-4" /> },
  { key: 'brand_bonus', label: '品牌管理奖', icon: <BadgeCheck className="w-4 h-4" /> },
  { key: 'dividend', label: '分红奖', icon: <PiggyBank className="w-4 h-4" /> },
]

const TYPE_CONFIG: Record<string, { name: string; iconBg: string; iconColor: string; icon: React.ReactNode }> = {
  referral: {
    name: '直推奖',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    icon: <UserPlus className="w-5 h-5" />,
  },
  team: {
    name: '团队奖',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    icon: <Users className="w-5 h-5" />,
  },
  brand_bonus: {
    name: '品牌管理奖',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    icon: <BadgeCheck className="w-5 h-5" />,
  },
  dividend: {
    name: '分红奖',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    icon: <PiggyBank className="w-5 h-5" />,
  },
}

// ---- 主组件 ----

export default function RewardsPage() {
  const router = useRouter()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [stats, setStats] = useState<RewardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<RewardTypeKey>('all')
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
      const [rewardsRes, statsRes] = await Promise.allSettled([
        fetch('/api/rewards', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/rewards', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }),
      ])

      if (rewardsRes.status === 'fulfilled' && rewardsRes.value.ok) {
        const data = await rewardsRes.value.json()
        if (data.success) setRewards(data.data || [])
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const data = await statsRes.value.json()
        if (data.success) setStats(data.data)
      }
    } catch (err) {
      console.error('获取收益数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 本月收益
  const thisMonthRewards = rewards
    .filter((r) => {
      const d = new Date(r.createdAt)
      const now = new Date()
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && r.status === 'paid'
    })
    .reduce((sum, r) => sum + r.amount, 0)

  // 昨日收益
  const yesterdayRewards = rewards
    .filter((r) => {
      const d = new Date(r.createdAt)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return (
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate() &&
        r.status === 'paid'
      )
    })
    .reduce((sum, r) => sum + r.amount, 0)

  // 筛选 + 分页
  const filtered = activeTab === 'all' ? rewards : rewards.filter((r) => r.type === activeTab)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleTabChange = (tab: RewardTypeKey) => {
    setActiveTab(tab)
    setPage(1)
  }

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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-base p-5 animate-pulse">
                <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-8 w-24 bg-gray-200 rounded" />
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
            <TrendingUp className="w-6 h-6 text-primary" />
            收益明细
          </h1>
          <span className="text-sm text-gray-400 ml-1">共 {filtered.length} 条</span>
        </div>

        {/* 顶部统计卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-sm text-gray-400">累计收益</span>
            </div>
            <p className="text-2xl font-bold text-primary">¥{formatMoney(stats?.totalAmount || 0)}</p>
          </div>
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-400">本月收益</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">¥{formatMoney(thisMonthRewards)}</p>
          </div>
          <div className="card-base p-5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-secondary" />
              <span className="text-sm text-gray-400">昨日收益</span>
            </div>
            <p className="text-2xl font-bold text-secondary">¥{formatMoney(yesterdayRewards)}</p>
          </div>
        </div>

        {/* 类型筛选标签 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 奖励列表 */}
        {paged.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {paged.map((reward) => (
              <RewardCard key={reward.id} reward={reward} formatMoney={formatMoney} formatRelativeTime={formatRelativeTime} />
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

// ---- 奖励卡片 ----

function RewardCard({
  reward,
  formatMoney,
  formatRelativeTime,
}: {
  reward: Reward
  formatMoney: (n: number) => string
  formatRelativeTime: (s: string) => string
}) {
  const conf = TYPE_CONFIG[reward.type] || {
    name: reward.type,
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
    icon: <Package className="w-5 h-5" />,
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
            {reward.level != null && reward.type === 'brand_bonus' && (
              <span className="text-xs text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">第{reward.level}层</span>
            )}
            {reward.order && (
              <Link
                href={`/dashboard/orders/${reward.orderId}`}
                className="text-xs text-gray-400 hover:text-primary transition-colors font-mono truncate"
              >
                {reward.order.orderNo}
              </Link>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {reward.type === 'dividend' ? '分红结算' : reward.type === 'referral' ? '来自直推会员的购买' : reward.type === 'team' ? `来自第${reward.level || 1}层团队的购买` : `来自第${reward.level || '?'}层下级的购买`}
          </p>
          <p className="text-xs text-gray-300 mt-1">{formatRelativeTime(reward.createdAt)}</p>
        </div>

        {/* 右侧金额 */}
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-green-600">+¥{formatMoney(reward.amount)}</p>
          {reward.status === 'pending' && (
            <span className="text-xs text-yellow-500 bg-yellow-50 px-1.5 py-0.5 rounded">待发放</span>
          )}
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
      <h3 className="text-lg font-semibold text-gray-500 mb-2">暂无收益记录</h3>
      <p className="text-sm text-gray-400 mb-6">推荐好友购物即可获得奖励</p>
      <Link
        href="/products"
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-600 transition-colors shadow-md shadow-primary/25"
      >
        去购物
      </Link>
    </div>
  )
}