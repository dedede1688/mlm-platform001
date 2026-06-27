'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Users, DollarSign, TrendingUp, Loader2, Filter } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

// ---- 类型 ----

interface TopProduct { productId: string; name: string; sales: number; quantity: number; orderCount: number }
interface TopMember { userId: string; nickname: string | null; phone: string; level: number; sales: number; orderCount: number }
interface LevelItem { level: number; label: string; count: number }

interface SalesReport { topProducts: TopProduct[]; topMembers: TopMember[] }
interface MembersReport {
  levelDistribution: LevelItem[]
  referrerRate: { withReferrer: number; total: number; rate: number }
  activity: { active7d: number; active30d: number; totalOrderUsers: number; active7dRate: number; active30dRate: number; purchaseRate: number }
}
interface FinanceReport {
  income: number
  expense: number
  netIncome: number
  breakdown: { refundTotal: number; withdrawalTotal: number }
  period: { days: number; startDate: string; endDate: string }
}

interface FunnelLevel { level: number; key: string; label: string; count: number; color: string; parent: string | null }
interface FunnelReport {
  funnel: FunnelLevel[]
  rates: { firstOrderRate: number; repeatRate: number; threePlusRate: number; fivePlusRate: number }
}

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-100 text-gray-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-cyan-100 text-cyan-700',
  4: 'bg-green-100 text-green-700',
  5: 'bg-yellow-100 text-yellow-700',
  6: 'bg-orange-100 text-orange-700',
  7: 'bg-red-100 text-red-700',
}

// ---- 主组件 ----

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'members' | 'finance' | 'funnel'>('sales')
  const [days, setDays] = useState(30)
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [members, setMembers] = useState<MembersReport | null>(null)
  const [finance, setFinance] = useState<FinanceReport | null>(null)
  const [funnel, setFunnel] = useState<FunnelReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    if (!token) return

    const fetchReport = async <T,>(url: string): Promise<T | null> => {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json()
      return d.success ? d.data : null
    }

    setLoading(true)
    Promise.all([
      fetchReport<SalesReport>(`/api/admin/reports/sales?days=${days}`),
      fetchReport<MembersReport>(`/api/admin/reports/members`),
      fetchReport<FinanceReport>(`/api/admin/reports/finance?days=${days}`),
      fetchReport<FunnelReport>(`/api/admin/reports/funnel`),
    ]).then(([s, m, f, fn]) => {
      setSales(s)
      setMembers(m)
      setFinance(f)
      setFunnel(fn)
    }).catch(err => console.error('[Reports]', err)).finally(() => setLoading(false))
  }, [days])

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">运营报表</h1>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              近{d}天
            </button>
          ))}
        </div>
      </div>

      {/* ---- Tab 切换 ---- */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { key: 'sales' as const, label: '销售报表', icon: <TrendingUp className="w-4 h-4" /> },
          { key: 'members' as const, label: '会员报表', icon: <Users className="w-4 h-4" /> },
          { key: 'finance' as const, label: '财务报表', icon: <DollarSign className="w-4 h-4" /> },
          { key: 'funnel' as const, label: '转化漏斗', icon: <Filter className="w-4 h-4" /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && activeTab === 'sales' && sales && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">TOP 10 商品（按销售额）</h2>
            <div className="space-y-2">
              {sales.topProducts.length === 0 ? (
                <p className="text-gray-400 text-sm">暂无数据</p>
              ) : sales.topProducts.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' : i < 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-gray-700">{p.name}</span>
                  <span className="text-sm font-semibold text-green-600">¥{formatMoney(p.sales)}</span>
                  <span className="text-xs text-gray-400 w-20 text-right">{p.orderCount} 单 / {p.quantity} 件</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">TOP 10 会员（按消费额）</h2>
            <div className="space-y-2">
              {sales.topMembers.length === 0 ? (
                <p className="text-gray-400 text-sm">暂无数据</p>
              ) : sales.topMembers.map((m, i) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' : i < 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-gray-700">
                    {m.nickname || m.phone}
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${LEVEL_COLORS[m.level] || 'bg-gray-100 text-gray-500'}`}>
                      L{m.level}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-green-600">¥{formatMoney(m.sales)}</span>
                  <span className="text-xs text-gray-400 w-16 text-right">{m.orderCount} 单</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'members' && members && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="总会员" value={String(members.referrerRate.total)} color="bg-blue-50 text-blue-600" />
            <StatCard label="有推荐人" value={String(members.referrerRate.withReferrer)} color="bg-cyan-50 text-cyan-600" />
            <StatCard label="推荐转化率" value={`${members.referrerRate.rate}%`} color="bg-green-50 text-green-600" />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">等级分布</h2>
            <div className="space-y-2">
              {members.levelDistribution.map(l => {
                const max = Math.max(...members.levelDistribution.map(x => x.count))
                const pct = max > 0 ? (l.count / max) * 100 : 0
                return (
                  <div key={l.level} className="flex items-center gap-3">
                    <span className={`w-12 px-2 py-1 rounded text-xs font-medium text-center ${LEVEL_COLORS[l.level] || 'bg-gray-100 text-gray-500'}`}>
                      L{l.level}
                    </span>
                    <span className="w-16 text-sm text-gray-700">{l.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-sm font-semibold text-gray-900 text-right">{l.count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">活跃度</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard label="7日活跃" value={`${members.activity.active7d} (${members.activity.active7dRate}%)`} color="bg-blue-50 text-blue-600" />
              <StatCard label="30日活跃" value={`${members.activity.active30d} (${members.activity.active30dRate}%)`} color="bg-cyan-50 text-cyan-600" />
              <StatCard label="总下单会员" value={`${members.activity.totalOrderUsers} (${members.activity.purchaseRate}%)`} color="bg-green-50 text-green-600" />
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'finance' && finance && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="总收入" value={`¥${formatMoney(finance.income)}`} color="bg-green-50 text-green-600" />
            <StatCard label="总支出" value={`¥${formatMoney(finance.expense)}`} color="bg-red-50 text-red-600" />
            <StatCard label="净收入" value={`¥${formatMoney(finance.netIncome)}`} color={finance.netIncome >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">支出拆解</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">退款支出</span>
                <span className="text-sm font-semibold text-red-600">¥{formatMoney(finance.breakdown.refundTotal)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">提现支出</span>
                <span className="text-sm font-semibold text-red-600">¥{formatMoney(finance.breakdown.withdrawalTotal)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm font-semibold text-gray-900">总支出</span>
                <span className="text-sm font-bold text-red-600">¥{formatMoney(finance.expense)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">统计区间: {finance.period.startDate} 至 {finance.period.endDate}（近{finance.period.days}天）</p>
          </div>
        </div>
      )}

      {!loading && activeTab === 'funnel' && funnel && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="注册→首单" value={`${funnel.rates.firstOrderRate}%`} color="bg-blue-50 text-blue-600" />
            <StatCard label="首单→复购" value={`${funnel.rates.repeatRate}%`} color="bg-cyan-50 text-cyan-600" />
            <StatCard label="首单→3 单+" value={`${funnel.rates.threePlusRate}%`} color="bg-green-50 text-green-600" />
            <StatCard label="首单→5 单+" value={`${funnel.rates.fivePlusRate}%`} color="bg-emerald-50 text-emerald-600" />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">5 级转化漏斗</h2>
            <div className="space-y-4">
              {funnel.funnel.map((step, i) => {
                const max = funnel.funnel[0].count
                const widthPct = max > 0 ? (step.count / max) * 100 : 0
                const parentStep = step.parent ? funnel.funnel.find(s => s.key === step.parent) : null
                const conversionRate = parentStep && parentStep.count > 0
                  ? Math.round((step.count / parentStep.count) * 100 * 10) / 10
                  : null
                const bgColor = step.color.replace('bg-', 'bg-').replace('-500', '-100')
                const textColor = step.color.replace('bg-', 'text-').replace('-500', '-700')
                return (
                  <div key={step.key}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full ${step.color} text-white text-xs font-bold flex items-center justify-center`}>
                          L{step.level}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{step.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {conversionRate !== null && (
                          <span className={`text-xs font-medium ${textColor}`}>
                            ↑ 转化 {conversionRate}%
                          </span>
                        )}
                        <span className="text-lg font-bold text-gray-900 tabular-nums">
                          {step.count.toLocaleString()}
                          <span className="text-xs text-gray-400 font-normal ml-1">人</span>
                        </span>
                      </div>
                    </div>
                    <div className={`relative h-10 rounded-lg overflow-hidden ${bgColor}`}>
                      <div
                        className={`absolute inset-y-0 left-0 ${step.color} transition-all duration-500 rounded-lg flex items-center justify-end pr-3`}
                        style={{ width: `${widthPct}%` }}
                      >
                        {widthPct > 20 && (
                          <span className="text-white text-xs font-medium">{widthPct.toFixed(1)}%</span>
                        )}
                      </div>
                      {widthPct <= 20 && (
                        <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-gray-600">
                          {widthPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-6">统计区间: 全部时间（漏斗按历史累计计算，不受页面顶部时间切换影响）</p>
          </div>
        </div>
      )}
    </>
  )
}

// ---- 子组件 ----

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const [textColor, bgColor] = color.split(' ')
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
    </div>
  )
}
