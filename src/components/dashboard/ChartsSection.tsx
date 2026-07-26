'use client'

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

interface ChartData {
  categoryBreakdown: Array<{ type: string; label: string; amount: number; color: string }>
  trend: Array<{ month: string; amount: number }>
  pieHasData: boolean
  trendHasData: boolean
  totalMonthAmount: number
}

export default function ChartsSection({ data }: { data: ChartData }) {
  const { categoryBreakdown, trend, pieHasData, trendHasData, totalMonthAmount } = data

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
      {/* Category Pie Chart */}
      <div className="card-base p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm sm:text-base font-semibold text-gray-900">收益来源</h3>
        </div>
        {pieHasData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 items-center">
            <div className="h-44 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius="80%"
                    innerRadius="45%"
                    paddingAngle={2}
                  >
                    {categoryBreakdown.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${formatMoney(Number(value))}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 sm:space-y-1.5 text-xs sm:text-sm">
              {categoryBreakdown.map(c => (
                <div key={c.type} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 text-gray-700 truncate">{c.label}</span>
                  <span className="font-medium text-gray-900">¥{formatMoney(c.amount)}</span>
                  <span className="text-gray-400 w-12 text-right">
                    {totalMonthAmount > 0 ? Math.round((c.amount / totalMonthAmount) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">本月暂无收益明细</p>
        )}
      </div>

      {/* Trend Line Chart */}
      <div className="card-base p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm sm:text-base font-semibold text-gray-900">最近 6 个月收益</h3>
        </div>
        {trendHasData ? (
          <div className="h-44 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip formatter={(value) => `${formatMoney(Number(value))}`} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f97316' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">近 6 个月暂无收益</p>
        )}
      </div>
    </div>
  )
}
