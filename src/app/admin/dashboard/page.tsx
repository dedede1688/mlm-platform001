'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart3, Users, ShoppingCart, DollarSign,
  TrendingUp, Package, Clock, RefreshCw,
  AlertTriangle, Receipt, Calendar, Wallet, Truck, Box
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { formatMoney } from '@/lib/utils/format'

// 动态导入 recharts 组件，减少初始加载体积
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false })
const LineChart = dynamic(() => import('recharts').then(mod => mod.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false })
const Legend = dynamic(() => import('recharts').then(mod => mod.Legend), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false })

// ---- 类型定义 ----

interface SalesStats {
  today: number
  week: number
  month: number
  total: number
  // v51.0: 环比% 字段
  todayVsYesterday: number
  weekVsLastWeek: number
  monthVsLastMonth: number
}

interface OrderStats {
  today: number
  pending: number
  total: number
  // v51.0: 环比% 字段
  todayVsYesterday: number
}

interface UserStats {
  todayNew: number
  total: number
  active7d: number
  // v51.0: 环比% 字段
  todayNewVsYesterday: number
}

interface ProductStats {
  total: number
  lowStock: number
}

interface StatsData {
  sales: SalesStats
  orders: OrderStats
  users: UserStats
  products: ProductStats
  refundPending: number
}

interface TrendItem {
  date: string
  sales: number
  orderCount: number
}

// v67:数据中台 summary 类型
interface YesterdayReport {
  date: string
  orders: { count: number; lastWeekCount: number; vsLastWeek: number }
  sales: { amount: number; lastWeekAmount: number; vsLastWeek: number }
  newUsers: { count: number; lastWeekCount: number; vsLastWeek: number }
  refunds: { count: number; amount: number; lastWeekCount: number; lastWeekAmount: number; vsLastWeek: number }
  withdrawals: { count: number; amount: number; lastWeekCount: number; lastWeekAmount: number; vsLastWeek: number }
}

interface PendingCounts {
  refund: number
  withdrawal: number
  shipment: number
  lowStock: number
  total: number
}

interface LowStockItem {
  id: string
  name: string
  stock: number
  sortOrder: number
}

interface SummaryData {
  yesterdayReport: YesterdayReport
  pending: PendingCounts
  lowStockProducts: LowStockItem[]
  timestamp: string
}

// ---- 主组件 ----

export default function AdminDashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [trend, setTrend] = useState<TrendItem[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [days, setDays] = useState(7)
  // v67:30 秒自动刷新 + 末次刷新时间
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const [statsRes, trendRes, summaryRes] = await Promise.all([
        fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/stats/trend?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        // v67:数据中台 summary(昨日日报 + 今日异常)
        fetch('/api/admin/dashboard/summary', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (statsRes.status === 403 || statsRes.status === 401) {
        console.error('[AdminDashboard] stats API 认证失败:', statsRes.status)
        if (trendRes.status === 403 || trendRes.status === 401) {
          const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/admin/dashboard'
          window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`
        }
        return
      }

      const [statsData, trendData, summaryData] = await Promise.all([
        statsRes.json(),
        trendRes.json(),
        summaryRes.json(),
      ])

      if (statsData.success) setStats(statsData.data)
      if (trendData.success) setTrend(trendData.data || [])
      if (summaryData.success) {
        setSummary(summaryData.data)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('获取统计数据失败:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [days])

  // v67.1:2 分钟自动刷新(胡子哥反馈 30 秒太频繁)
  useEffect(() => {
    if (!stats) return  // 等首次加载完再开自动刷新
    const timer = setInterval(() => {
      fetchData(false)
    }, 120000)  // 120 秒 = 2 分钟
    return () => clearInterval(timer)
  }, [fetchData, stats])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => fetchData(true)

  const handleDaysChange = (newDays: number) => {
    if (newDays !== days) setDays(newDays)
  }

  const getDateRange = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return `${fmt(start)} 至 ${fmt(end)}`
  }

  // ---- 渲染 ----
  return (
    <>
      {/* 页面标题 + 刷新 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">数据中台</h1>
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              最近更新: {lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              <span className="text-gray-300">·</span>
              <span>2 分钟自动刷新</span>
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300
            text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {loading ? (
        /* 骨架屏 */
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-lg p-5">
                <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-28" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-6 h-80">
              <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
              <div className="h-60 bg-gray-100 rounded" />
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 h-80">
              <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
              <div className="h-60 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ---- 指标卡片 ---- */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* 销售额 */}
              <MetricCard
                icon={<DollarSign className="w-5 h-5" />}
                label="今日销售额"
                value={`¥${formatMoney(stats.sales.today)}`}
                color="text-green-600 bg-green-50"
                delta={stats.sales.todayVsYesterday}
                deltaLabel="vs 昨日"
              />
              <MetricCard
                icon={<DollarSign className="w-5 h-5" />}
                label="本周销售额"
                value={`¥${formatMoney(stats.sales.week)}`}
                color="text-green-600 bg-green-50"
                delta={stats.sales.weekVsLastWeek}
                deltaLabel="vs 上周"
              />
              <MetricCard
                icon={<DollarSign className="w-5 h-5" />}
                label="本月销售额"
                value={`¥${formatMoney(stats.sales.month)}`}
                color="text-green-600 bg-green-50"
                delta={stats.sales.monthVsLastMonth}
                deltaLabel="vs 上月"
              />
              <MetricCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="总销售额"
                value={`¥${formatMoney(stats.sales.total)}`}
                color="text-emerald-600 bg-emerald-50"
              />

              {/* 订单 */}
              <MetricCard
                icon={<ShoppingCart className="w-5 h-5" />}
                label="今日订单数"
                value={String(stats.orders.today)}
                color="text-blue-600 bg-blue-50"
                delta={stats.orders.todayVsYesterday}
                deltaLabel="vs 昨日"
              />
              <MetricCard
                icon={<Clock className="w-5 h-5" />}
                label="待处理订单"
                value={String(stats.orders.pending)}
                color="text-orange-600 bg-orange-50"
                onClick={() => router.push('/admin/orders?status=pending')}
              />
              <MetricCard
                icon={<ShoppingCart className="w-5 h-5" />}
                label="总订单数"
                value={String(stats.orders.total)}
                color="text-indigo-600 bg-indigo-50"
              />

              {/* 用户 */}
              <MetricCard
                icon={<Users className="w-5 h-5" />}
                label="今日新增用户"
                value={String(stats.users.todayNew)}
                color="text-purple-600 bg-purple-50"
                delta={stats.users.todayNewVsYesterday}
                deltaLabel="vs 昨日"
                onClick={() => router.push('/admin/users')}
              />
              <MetricCard
                icon={<Users className="w-5 h-5" />}
                label="总用户数"
                value={String(stats.users.total)}
                color="text-violet-600 bg-violet-50"
              />
              <MetricCard
                icon={<Users className="w-5 h-5" />}
                label="7日活跃用户"
                value={String(stats.users.active7d)}
                color="text-cyan-600 bg-cyan-50"
              />

              {/* 商品 */}
              <MetricCard
                icon={<Package className="w-5 h-5" />}
                label="商品总数"
                value={String(stats.products.total)}
                color="text-sky-600 bg-sky-50"
              />
              <MetricCard
                icon={<AlertTriangle className="w-5 h-5" />}
                label="低库存商品"
                value={String(stats.products.lowStock)}
                color={stats.products.lowStock > 0 ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50'}
              />

              {/* 退款 */}
              <Link href="/admin/refunds" className="block">
                <MetricCard
                  icon={<Receipt className="w-5 h-5" />}
                  label="待审核退款"
                  value={String(stats.refundPending)}
                  color={stats.refundPending > 0 ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50'}
                  highlight={stats.refundPending > 0}
                />
              </Link>
            </div>
          )}

          {/* v67:昨日日报 + 今日异常 */}
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* 昨日日报卡 */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-xl shadow-lg p-6 border border-blue-100">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">昨日日报</h2>
                  <span className="ml-auto text-xs text-gray-500">
                    {summary.yesterdayReport.date}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ReportItem
                    icon={<ShoppingCart className="w-4 h-4" />}
                    label="订单数"
                    value={`${summary.yesterdayReport.orders.count} 笔`}
                    delta={summary.yesterdayReport.orders.vsLastWeek}
                    deltaLabel="vs 上周同日"
                  />
                  <ReportItem
                    icon={<DollarSign className="w-4 h-4" />}
                    label="销售额"
                    value={`¥${formatMoney(summary.yesterdayReport.sales.amount)}`}
                    delta={summary.yesterdayReport.sales.vsLastWeek}
                    deltaLabel="vs 上周同日"
                  />
                  <ReportItem
                    icon={<Users className="w-4 h-4" />}
                    label="新增用户"
                    value={`${summary.yesterdayReport.newUsers.count} 人`}
                    delta={summary.yesterdayReport.newUsers.vsLastWeek}
                    deltaLabel="vs 上周同日"
                  />
                  <ReportItem
                    icon={<Wallet className="w-4 h-4" />}
                    label="提现申请"
                    value={`${summary.yesterdayReport.withdrawals.count} 笔 / ¥${formatMoney(summary.yesterdayReport.withdrawals.amount)}`}
                    delta={summary.yesterdayReport.withdrawals.vsLastWeek}
                    deltaLabel="vs 上周同日"
                  />
                </div>
                {summary.yesterdayReport.refunds.count > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-gray-600 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    昨日退款: <b>{summary.yesterdayReport.refunds.count}</b> 笔,合计 <b>¥{formatMoney(summary.yesterdayReport.refunds.amount)}</b>
                  </div>
                )}
              </div>

              {/* 今日异常卡 */}
              <div className="bg-gradient-to-r from-orange-50 via-red-50 to-pink-50 rounded-xl shadow-lg p-6 border border-orange-100">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-semibold text-gray-900">今日异常</h2>
                  {summary.pending.total > 0 && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">
                      待处理 {summary.pending.total}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <PendingItem
                    icon={<Receipt className="w-4 h-4" />}
                    label="退款待审"
                    count={summary.pending.refund}
                    href="/admin/refunds"
                    color="text-red-600 bg-red-50"
                  />
                  <PendingItem
                    icon={<Wallet className="w-4 h-4" />}
                    label="提现待审"
                    count={summary.pending.withdrawal}
                    href="/admin/finance"
                    color="text-amber-600 bg-amber-50"
                  />
                  <PendingItem
                    icon={<Truck className="w-4 h-4" />}
                    label="发货超时(已支付 24h 未发货)"
                    count={summary.pending.shipment}
                    href="/admin/orders"
                    color="text-blue-600 bg-blue-50"
                  />
                  <PendingItem
                    icon={<Box className="w-4 h-4" />}
                    label="库存预警(≤10)"
                    count={summary.pending.lowStock}
                    href="/admin/products"
                    color="text-purple-600 bg-purple-50"
                  />
                </div>

                {/* 库存预警商品列表 */}
                {summary.lowStockProducts.length > 0 && (
                  <details className="mt-3 pt-3 border-t border-orange-200">
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                      📦 展开查看 {summary.lowStockProducts.length} 个低库存商品
                    </summary>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {summary.lowStockProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-white/50">
                          <span className="truncate flex-1 text-gray-700">{p.name}</span>
                          <span className={`font-bold ml-2 ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                            库存: {p.stock}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* ---- 日期范围切换 ---- */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => handleDaysChange(7)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                days === 7
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              近7天
            </button>
            <button
              onClick={() => handleDaysChange(30)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                days === 30
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              近30天
            </button>
            <button
              onClick={() => handleDaysChange(90)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                days === 90
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              近90天
            </button>
            <span className="text-sm text-gray-500">{getDateRange()}</span>
          </div>

          {/* ---- 图表区域 ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 销售额趋势 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">销售额趋势</h2>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `¥${v}`} />
                    <Tooltip
                      formatter={(value, name) => [
                        name === '销售额' ? `¥${formatMoney(Number(value))}` : String(value),
                        String(name),
                      ]}
                      labelFormatter={(label) => `日期: ${String(label)}`}
                    />
                    <Legend />
                    <Bar dataKey="sales" name="销售额" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-400">暂无数据</div>
              )}
            </div>

            {/* 订单量趋势 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">订单量趋势</h2>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) => [String(value), String(name)]}
                      labelFormatter={(label) => `日期: ${String(label)}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="orderCount"
                      name="订单数"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-400">暂无数据</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ---- 指标卡片子组件 ----

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  highlight?: boolean
  // v51.0: 环比% 字段
  delta?: number
  deltaLabel?: string
  onClick?: () => void  // v59: 卡片点击跳转
}

function MetricCard({ icon, label, value, color, highlight, delta, deltaLabel, onClick }: MetricCardProps) {
  const [textColor, bgColor] = color.split(' ')
  // v51.0: 环比% 颜色 + 图标
  const deltaColor = delta === undefined || delta === 0
    ? 'text-gray-400'
    : delta > 0
    ? 'text-green-600'
    : 'text-red-600'
  const deltaArrow = delta === undefined || delta === 0
    ? '→'
    : delta > 0
    ? '↑'
    : '↓'
  return (
    <div className={`bg-white rounded-xl shadow-lg p-5 flex items-center gap-4 hover:shadow-xl transition-shadow ${
      highlight ? 'ring-2 ring-red-300 cursor-pointer' : ''
    } ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor} ${textColor}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {delta !== undefined && (
            <span className={`text-xs font-semibold ${deltaColor} whitespace-nowrap`} title={deltaLabel}>
              {deltaArrow} {Math.abs(delta)}%{deltaLabel && <span className="text-gray-400 font-normal ml-1">{deltaLabel}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// v67:日报单项(昨日日报卡用)
function ReportItem({ icon, label, value, delta, deltaLabel }: {
  icon: React.ReactNode
  label: string
  value: string
  delta?: number
  deltaLabel?: string
}) {
  const deltaColor = delta === undefined || delta === 0
    ? 'text-gray-400'
    : delta > 0
    ? 'text-green-600'
    : 'text-red-600'
  const deltaArrow = delta === undefined || delta === 0
    ? ''
    : delta > 0
    ? '↑'
    : '↓'
  return (
    <div className="bg-white/70 backdrop-blur rounded-lg p-3 border border-white/50">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-base font-bold text-gray-900">{value}</p>
        {delta !== undefined && (
          <span className={`text-xs font-semibold ${deltaColor}`} title={deltaLabel}>
            {deltaArrow} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  )
}

// v67:今日异常项(带穿透链接)
function PendingItem({ icon, label, count, href, color }: {
  icon: React.ReactNode
  label: string
  count: number
  href: string
  color: string
}) {
  const [textColor, bgColor] = color.split(' ')
  const hasCount = count > 0
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
        hasCount
          ? 'bg-white/80 border-orange-200 hover:bg-white hover:border-orange-300'
          : 'bg-white/40 border-gray-100 hover:bg-white/60'
      }`}
    >
      <div className={`w-8 h-8 rounded flex items-center justify-center ${bgColor} ${textColor}`}>
        {icon}
      </div>
      <span className={`flex-1 text-sm ${hasCount ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
      {hasCount ? (
        <span className="text-lg font-bold text-red-600">{count}</span>
      ) : (
        <span className="text-sm text-gray-400">0</span>
      )}
      <span className="text-xs text-gray-400">→</span>
    </Link>
  )
}