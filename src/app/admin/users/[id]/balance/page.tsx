'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wallet, Loader2, ChevronLeft, ChevronRight,
  ShoppingCart, Undo2, Gift, Lock, Unlock, Settings2, Banknote
} from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

interface UserInfo {
  id: string
  phone: string
  nickname: string | null
  balance: number
  frozenBalance: number
  consumeBalance: number
  earningsPending: number
  earningsAvailable: number
  earningsVoided: number
}

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
  payment: { name: '支付扣款', icon: <ShoppingCart className="w-4 h-4" />, isPositive: false },
  refund: { name: '订单退款', icon: <Undo2 className="w-4 h-4" />, isPositive: true },
  reward: { name: '推荐/品牌/分红奖励', icon: <Gift className="w-4 h-4" />, isPositive: true },
  referral_reward: { name: '直推奖', icon: <Gift className="w-4 h-4" />, isPositive: true },
  brand_bonus: { name: '品牌管理奖', icon: <Gift className="w-4 h-4" />, isPositive: true },
  dividend_reward: { name: '分红奖', icon: <Gift className="w-4 h-4" />, isPositive: true },
  withdraw_freeze: { name: '提现冻结', icon: <Lock className="w-4 h-4" />, isPositive: false },
  withdraw: { name: '提现扣款', icon: <Banknote className="w-4 h-4" />, isPositive: false },
  unfreeze: { name: '提现解冻', icon: <Unlock className="w-4 h-4" />, isPositive: true },
  admin_adjust: { name: '管理员调整', icon: <Settings2 className="w-4 h-4" />, isPositive: null },
  manual_reward: { name: '手动奖励', icon: <Gift className="w-4 h-4" />, isPositive: true },
  refund_reward: { name: '奖励回收', icon: <Undo2 className="w-4 h-4" />, isPositive: false },
  refund_dividend: { name: '分红回收', icon: <Undo2 className="w-4 h-4" />, isPositive: false },
  daily_dividend: { name: '每日分红', icon: <Gift className="w-4 h-4" />, isPositive: true },
}

type TypeFilter = 'all' | 'payment' | 'reward' | 'withdraw' | 'admin_adjust'

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'payment', label: '消费' },
  { key: 'reward', label: '奖励' },
  { key: 'withdraw', label: '提现' },
  { key: 'admin_adjust', label: '管理员调整' },
]

export default function AdminUserBalancePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [records, setRecords] = useState<BalanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TypeFilter>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)

    const pathParts = window.location.pathname.split('/')
    const idIndex = pathParts.indexOf('users') + 1
    if (idIndex > 0 && pathParts[idIndex]) {
      setUserId(pathParts[idIndex])
    }
  }, [router])

  useEffect(() => {
    if (token && userId) {
      fetchRecords(token)
    }
  }, [token, userId, activeTab, page])

  const fetchRecords = useCallback(async (authToken: string) => {
    setLoading(true)
    try {
      const typeParam = activeTab === 'all' ? '' : activeTab === 'reward' ? 'referral_reward,brand_bonus,dividend_reward,daily_dividend,manual_reward,reward' : activeTab === 'withdraw' ? 'withdraw_freeze,withdraw,unfreeze' : activeTab
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (typeParam) params.set('type', typeParam)
      const res = await fetch(`/api/admin/users/${userId}/balance-records?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (data.success) {
        setUser(data.data.user)
        setRecords(data.data.records || [])
        setTotalPages(data.data.pagination?.totalPages || 1)
        setTotal(data.data.pagination?.total || 0)
      }
    } catch (_error) {
      console.error('获取流水失败:', _error)
    } finally {
      setLoading(false)
    }
  }, [userId, activeTab, page])

  const handleTabChange = (tab: TypeFilter) => {
    setActiveTab(tab)
    setPage(1)
  }

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Wallet className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">余额流水</h1>
          {user && (
            <p className="text-sm text-gray-500">{user.nickname || user.phone}（{user.phone}）</p>
          )}
        </div>
      </div>

      {user && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
              <p className="text-xs text-gray-500 mb-1">可用余额</p>
              <p className="text-lg font-bold text-gray-900">¥{formatMoney(user.balance)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-gray-400">
              <p className="text-xs text-gray-500 mb-1">冻结余额</p>
              <p className="text-lg font-bold text-gray-900">¥{formatMoney(user.frozenBalance)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-500">
              <p className="text-xs text-gray-500 mb-1">消费余额</p>
              <p className="text-lg font-bold text-gray-900">¥{formatMoney(user.consumeBalance ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
              <p className="text-xs text-gray-500 mb-1">待结算收益</p>
              <p className="text-lg font-bold text-gray-500">¥{formatMoney(user.earningsPending ?? 0)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
              <p className="text-xs text-gray-500 mb-1">可提现收益</p>
              <p className="text-lg font-bold text-green-600">¥{formatMoney(user.earningsAvailable ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-500">
              <p className="text-xs text-gray-500 mb-1">累计作废</p>
              <p className="text-lg font-bold text-red-600">¥{formatMoney(user.earningsVoided ?? 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
              <p className="text-xs text-gray-500 mb-1">总余额</p>
              <p className="text-lg font-bold text-gray-900">¥{formatMoney(user.balance + user.frozenBalance)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
              <p className="text-xs text-gray-500 mb-1">流水条数</p>
              <p className="text-lg font-bold text-gray-900">{total}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Wallet className="w-12 h-12 mb-3" />
            <p>暂无流水记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">描述</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">金额</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">余额</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">冻结余额</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r) => {
                  const conf = TYPE_CONFIG[r.type] || { name: r.type, icon: <Wallet className="w-4 h-4" />, isPositive: null as unknown as boolean }
                  const isPositive = conf.isPositive === true
                  const isNegative = conf.isPositive === false
                  const amountColor = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-700'
                  const amountSign = r.amount > 0 ? '+' : ''
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isPositive ? 'bg-green-100 text-green-600' : isNegative ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {conf.icon}
                          </span>
                          <span className="text-sm text-gray-900">{conf.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{r.description || '-'}</td>
                      <td className={`px-4 py-3 text-sm font-medium text-right ${amountColor}`}>{amountSign}¥{formatMoney(Math.abs(r.amount))}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">¥{formatMoney(r.balance)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">¥{formatMoney(r.frozenBalance)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatTime(r.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">共 {total} 条，第 {page}/{totalPages} 页</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}