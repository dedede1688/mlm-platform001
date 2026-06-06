'use client'

import { useState, useEffect } from 'react'
import {
  BarChart3, Users, ShoppingCart, DollarSign,
  TrendingUp, Package, Clock
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ---- 类型定义 ----

interface DashboardData {
  today: { sales: number; orderCount: number; newUsers: number }
  month: { sales: number; orderCount: number; newUsers: number }
  total: { sales: number; orderCount: number; users: number }
  pendingShipmentCount: number
  pendingWithdrawalCount: number
}

interface SalesTrendItem {
  date: string
  sales: number
  orderCount: number
}

interface UserGrowthItem {
  date: string
  newUsers: number
}

// ---- 主组件 ----

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [salesTrend, setSalesTrend] = useState<SalesTrendItem[]>([])
  const [userGrowth, setUserGrowth] = useState<UserGrowthItem[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)

  // 获取仪表盘数据
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const fetchDashboard = async () => {
      setLoading(true)
      try {
        const [dashRes, salesRes, userRes] = await Promise.all([
          fetch('/api/admin/statistics/dashboard', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/admin/statistics/sales-trend?days=${days}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/admin/statistics/user-growth?days=${days}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (dashRes.status === 403 || dashRes.status === 401) {
          window.location.href = '/login'
          return
        }

        const dashData = await dashRes.json()
        const salesData = await salesRes.json()
        const userData = await userRes.json()

        if (dashData.success) setDashboard(dashData.data)
        if (salesData.success) setSalesTrend(salesData.data || [])
        if (userData.success) setUserGrowth(userData.data || [])
      } catch (error) {
        console.error('获取统计数据失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [days])

  // 天数切换
  const handleDaysChange = (newDays: number) => {
    if (newDays !== days) setDays(newDays)
  }

  // 计算当前日期范围
  const getDateRange = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return `${fmt(start)} 至 ${fmt(end)}`
  }

  // 格式化金额
  const formatMoney = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">数据仪表盘</h1>
      </div>

        {loading ? (
          /* 骨架屏 */
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-lg p-6">
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
            {/* 指标卡片 */}
            {dashboard && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* 今日 */}
                <MetricCard icon={<DollarSign className="w-5 h-5" />} label="今日销售额" value={`¥${formatMoney(dashboard.today.sales)}`} color="text-green-600 bg-green-50" />
                <MetricCard icon={<ShoppingCart className="w-5 h-5" />} label="今日订单数" value={String(dashboard.today.orderCount)} color="text-blue-600 bg-blue-50" />
                <MetricCard icon={<Users className="w-5 h-5" />} label="今日新增会员" value={String(dashboard.today.newUsers)} color="text-purple-600 bg-purple-50" />
                {/* 本月 */}
                <MetricCard icon={<DollarSign className="w-5 h-5" />} label="本月销售额" value={`¥${formatMoney(dashboard.month.sales)}`} color="text-green-600 bg-green-50" />
                <MetricCard icon={<ShoppingCart className="w-5 h-5" />} label="本月订单数" value={String(dashboard.month.orderCount)} color="text-blue-600 bg-blue-50" />
                <MetricCard icon={<Users className="w-5 h-5" />} label="本月新增会员" value={String(dashboard.month.newUsers)} color="text-purple-600 bg-purple-50" />
                {/* 总计 */}
                <MetricCard icon={<TrendingUp className="w-5 h-5" />} label="总销售额" value={`¥${formatMoney(dashboard.total.sales)}`} color="text-emerald-600 bg-emerald-50" />
                <MetricCard icon={<ShoppingCart className="w-5 h-5" />} label="总订单数" value={String(dashboard.total.orderCount)} color="text-indigo-600 bg-indigo-50" />
                <MetricCard icon={<Users className="w-5 h-5" />} label="总会员数" value={String(dashboard.total.users)} color="text-violet-600 bg-violet-50" />
                {/* 待处理 */}
                <MetricCard icon={<Package className="w-5 h-5" />} label="待发货订单" value={String(dashboard.pendingShipmentCount)} color="text-orange-600 bg-orange-50" />
                <MetricCard icon={<Clock className="w-5 h-5" />} label="待审核提现" value={String(dashboard.pendingWithdrawalCount)} color="text-red-600 bg-red-50" />
              </div>
            )}

            {/* 全局日期范围切换 */}
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
              <span className="text-sm text-gray-500">{getDateRange()}</span>
            </div>

            {/* 图表区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 销售额趋势 */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">销售额趋势</h2>
                {salesTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis yAxisId="sales" orientation="left" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `¥${v}`} />
                      <Tooltip
                        formatter={(value, name) => [
                          name === '销售额' ? `¥${formatMoney(Number(value))}` : value,
                          String(name),
                        ]}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Legend />
                      <Bar yAxisId="sales" dataKey="sales" name="销售额" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">暂无数据</div>
                )}
              </div>

              {/* 订单量趋势 */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">订单量趋势</h2>
                {salesTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, name) => [value, String(name)]}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="orderCount" name="订单数" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">暂无数据</div>
                )}
              </div>

              {/* 会员增长趋势 */}
              <div className="bg-white rounded-xl shadow-lg p-6 lg:col-span-2">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">会员增长趋势</h2>
                {userGrowth.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={userGrowth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip
                        formatter={(value, name) => [value, String(name)]}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="newUsers" name="新增会员" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  const [textColor, bgColor] = color.split(' ')
  return (
    <div className="bg-white rounded-xl shadow-lg p-5 flex items-center gap-4 hover:shadow-xl transition-shadow">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor} ${textColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}