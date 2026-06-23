'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wallet, Loader2,
  ShoppingCart, Undo2, Gift, Lock, Unlock, Settings2, Banknote
} from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

interface BalanceRecord {
  id: string
  type: string
  amount: number
  balance: number
  frozenBalance: number
  sourceType: string | null
  sourceId: string | null
  description: string | null
  createdAt: string
}

const TYPE_CONFIG: Record<string, { name: string; icon: React.ReactNode; isPositive: boolean | null }> = {
  payment: { name: '支付扣款', icon: <ShoppingCart className="w-5 h-5" />, isPositive: false },
  refund: { name: '订单退款', icon: <Undo2 className="w-5 h-5" />, isPositive: true },
  reward: { name: '推荐/品牌/分红奖励', icon: <Gift className="w-5 h-5" />, isPositive: true },
  referral_reward: { name: '直推奖', icon: <Gift className="w-5 h-5" />, isPositive: true },
  brand_bonus: { name: '品牌管理奖', icon: <Gift className="w-5 h-5" />, isPositive: true },
  dividend_reward: { name: '分红奖', icon: <Gift className="w-5 h-5" />, isPositive: true },
  withdraw_freeze: { name: '提现冻结', icon: <Lock className="w-5 h-5" />, isPositive: false },
  withdraw: { name: '提现扣款', icon: <Banknote className="w-5 h-5" />, isPositive: false },
  unfreeze: { name: '提现解冻', icon: <Unlock className="w-5 h-5" />, isPositive: true },
  admin_adjust: { name: '管理员调整', icon: <Settings2 className="w-5 h-5" />, isPositive: null },
  manual_reward: { name: '手动奖励', icon: <Gift className="w-5 h-5" />, isPositive: true },
  refund_reward: { name: '奖励回收', icon: <Undo2 className="w-5 h-5" />, isPositive: false },
  refund_dividend: { name: '分红回收', icon: <Undo2 className="w-5 h-5" />, isPositive: false },
  daily_dividend: { name: '每日分红', icon: <Gift className="w-5 h-5" />, isPositive: true },
}

type TypeFilter = 'all' | 'payment' | 'reward' | 'withdraw' | 'admin_adjust'

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'payment', label: '消费' },
  { key: 'reward', label: '奖励' },
  { key: 'withdraw', label: '提现' },
  { key: 'admin_adjust', label: '管理员调整' },
]

export default function BalancePage() {
  const router = useRouter()
  const [records, setRecords] = useState<BalanceRecord[]>([])
  const [userBalance, setUserBalance] = useState<number | null>(null)
  const [userFrozenBalance, setUserFrozenBalance] = useState<number | null>(null)
  const [userConsumeBalance, setUserConsumeBalance] = useState<number>(0)
  const [userEarningsPending, setUserEarningsPending] = useState<number>(0)
  const [userEarningsAvailable, setUserEarningsAvailable] = useState<number>(0)
  const [userEarningsVoided, setUserEarningsVoided] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TypeFilter>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 20

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    fetchUser(storedToken)
    fetchRecords(storedToken)
  }, [router, activeTab, page])

  const fetchUser = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${authToken}` } })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setUserBalance(data.data.balance)
          setUserFrozenBalance(data.data.frozenBalance)
          setUserConsumeBalance(data.data.consumeBalance ?? 0)
          setUserEarningsPending(data.data.earningsPending ?? 0)
          setUserEarningsAvailable(data.data.earningsAvailable ?? 0)
          setUserEarningsVoided(data.data.earningsVoided ?? 0)
        }
      }
    } catch (_error) { console.error('获取用户信息失败:', _error) }
  }

  const fetchRecords = async (authToken: string) => {
    setLoading(true)
    try {
      const typeParam = activeTab === 'all' ? '' : activeTab === 'reward' ? 'referral_reward,brand_bonus,dividend_reward,daily_dividend,manual_reward,reward' : activeTab === 'withdraw' ? 'withdraw_freeze,withdraw,unfreeze' : activeTab
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (typeParam) params.set('type', typeParam)
      const res = await fetch(`/api/user/balance-records?${params}`, { headers: { Authorization: `Bearer ${authToken}` } })
      const data = await res.json()
      if (data.success) {
        setRecords(data.data.records || [])
        setTotalPages(data.data.pagination?.totalPages || 1)
      }
    } catch (_error) { console.error('获取流水失败:', _error) }
    finally { setLoading(false) }
  }

  const handleTabChange = (tab: TypeFilter) => {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            余额流水
          </h1>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-1">当前可用余额</p>
              <p className="text-2xl font-bold text-primary">¥{formatMoney(userBalance || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">冻结余额</p>
              <p className="text-2xl font-bold text-gray-500">¥{formatMoney(userFrozenBalance || 0)}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 mt-4 pt-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">消费余额</span>
                <span className="text-xs font-medium text-gray-600">¥{formatMoney(userConsumeBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">待结算收益</span>
                <span className="text-xs font-medium text-gray-600">¥{formatMoney(userEarningsPending)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">已结算收益</span>
                <span className="text-xs font-medium text-green-600">¥{formatMoney(userEarningsAvailable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">已作废收益</span>
                <span className="text-xs font-medium text-red-500">¥{formatMoney(userEarningsVoided)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse">
                <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">暂无流水记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((r) => {
              const conf = TYPE_CONFIG[r.type] || { name: r.type, icon: <Wallet className="w-5 h-5" />, isPositive: null as unknown as boolean }
              const isPositive = conf.isPositive === true
              const isNegative = conf.isPositive === false
              const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-700'
              const amountSign = r.amount > 0 ? '+' : ''
              return (
                <div key={r.id} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isPositive ? 'bg-green-100 text-green-600' : isNegative ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {conf.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{conf.name}</p>
                          {r.description && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(r.createdAt)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-lg font-bold ${amountColor}`}>{amountSign}¥{formatMoney(Math.abs(r.amount))}</p>
                          <p className="text-xs text-gray-400 mt-0.5">余额 ¥{formatMoney(r.balance)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 shadow-sm"
            >
              上一页
            </button>
            <span className="text-sm text-gray-500">第 {page} / {totalPages} 页</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 shadow-sm"
            >
              下一页
            </button>
          </div>
        )}
      </main>
    </div>
  )
}