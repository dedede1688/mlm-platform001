'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart3, Users, ShoppingCart, DollarSign,
  TrendingUp, Package, Clock, RefreshCw,
  AlertTriangle, Receipt
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

// ---- 主组件 ----

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [trend, setTrend] = useState<TrendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [days, setDays] = useState(7)

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const [statsRes, trendRes] = await Promise.all([
        fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/stats/trend?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (statsRes.status === 403 || statsRes.status === 401) {
        console.error('[AdminDashboard] stats API 认证失败:', statsRes.status)
        // 只在两个 API 都返回 401 时才跳转登录
        if (trendRes.status === 403 || trendRes.status === 401) {
          const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/admin/dashboard'
          window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`
        }
        return
      }

      const statsData = await statsRes.json()
      const trendData = await trendRes.json()

      if (statsData.success) setStats(statsData.data)
      if (trendData.success) setTrend(trendData.data || [])
    } catch (error) {
      console.error('获取统计数据失败:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [days])

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
          <h1 className="text-2xl font-bold text-gray-900">数据仪表盘</h1>
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
  // v51.0: 环比% 字段（正数=增长绿色↑，负数=下降红色↓，0=持平灰色→）
  delta?: number
  deltaLabel?: string  // v51.0: 环比描述（如"vs 昨日"），可不传
}

function MetricCard({ icon, label, value, color, highlight, delta, deltaLabel }: MetricCardProps) {
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
    }`}>
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