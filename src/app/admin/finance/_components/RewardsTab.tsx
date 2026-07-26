'use client'

import { Search, ChevronLeft, ChevronRight, Loader2, DollarSign } from 'lucide-react'
import { RewardItem, Pagination } from '../page'

export const REWARD_TYPE_MAP: Record<string, { label: string; color: string }> = {
  referral: { label: '直接奖', color: 'bg-blue-100 text-blue-700' },
  brand_bonus: { label: '品牌管理奖', color: 'bg-purple-100 text-purple-700' },
  dividend: { label: '分红奖', color: 'bg-amber-100 text-amber-700' },
  manual: { label: '手动', color: 'bg-gray-100 text-gray-700' },
}

export const REWARD_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  ...Object.entries(REWARD_TYPE_MAP).map(([value, info]) => ({ value, label: info.label })),
]
const REWARD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待发放', color: 'bg-yellow-50 text-yellow-700' },
  paid:    { label: '已发放', color: 'bg-green-50 text-green-700' },
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export interface RewardsTabProps {
  token: string | null
  rewards: RewardItem[]
  rewardPagination: Pagination
  rewardLoading: boolean
  rewardSearch: string
  rewardType: string
  rewardStartDate: string
  rewardEndDate: string
  stats: { referral: { total: number; count: number }; brand_bonus: { total: number; count: number }; dividend: { total: number; count: number }; grandTotal: number; grandCount: number } | null
  onSearchFieldChange: (field: string, value: string) => void
  onSearch: () => void
  onPageChange: (page: number) => void
}

export default function RewardsTab(props: RewardsTabProps) {
  const { token, rewards, rewardPagination, rewardLoading, rewardSearch, rewardType, rewardStartDate, rewardEndDate, stats, onSearchFieldChange, onSearch, onPageChange } = props
  return (
    <>
            {/* 汇总统计卡片 */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
                  <p className="text-xs text-gray-500 mb-1">直推奖</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.referral.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.referral.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
                  <p className="text-xs text-gray-500 mb-1">品牌管理奖</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.brand_bonus.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.brand_bonus.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
                  <p className="text-xs text-gray-500 mb-1">分红奖</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.dividend.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.dividend.count} 笔</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
                  <p className="text-xs text-gray-500 mb-1">合计</p>
                  <p className="text-lg font-bold text-gray-900">¥{stats.grandTotal.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{stats.grandCount} 笔</p>
                </div>
              </div>
            )}
            {/* 筛选栏 */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={rewardSearch}
                    onChange={e => onSearchFieldChange('rewardSearch', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onSearch()}
                    placeholder="搜索手机号/昵称..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  />
                </div>
                <select
                  value={rewardType}
                  onChange={e => onSearchFieldChange('rewardType', e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400"
                >
                  {REWARD_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={rewardStartDate}
                  onChange={e => onSearchFieldChange('rewardStartDate', e.target.value)}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400 text-sm"
                  placeholder="开始日期"
                />
                <span className="text-gray-400 text-sm">至</span>
                <input
                  type="date"
                  value={rewardEndDate}
                  onChange={e => onSearchFieldChange('rewardEndDate', e.target.value)}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400 text-sm"
                  placeholder="结束日期"
                />
                <button
                  onClick={onSearch}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                    transition-colors font-medium whitespace-nowrap"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* 奖励列表 */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
              {rewardLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : rewards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <DollarSign className="w-12 h-12 mb-3" />
                  <p>暂无奖励流水</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">类型</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金额</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单号</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">层级</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rewards.map(r => {
                        const typeInfo = REWARD_TYPE_MAP[r.type] || { label: r.type, color: 'bg-gray-100 text-gray-500' }
                        const statusInfo = REWARD_STATUS_MAP[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-500' }
                        return (
                          <tr key={`${r.type}-${r.id}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{r.user.phone}</div>
                              {r.user.nickname && (
                                <div className="text-xs text-gray-400">{r.user.nickname}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-green-600 font-medium">+¥{r.amount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {r.orderNo ? (
                                <span className="font-mono text-sm text-gray-700">{r.orderNo}</span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {r.level != null ? `第${r.level}层` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatTime(r.createdAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 分页 */}
              {!rewardLoading && rewardPagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-500">
                    共 {rewardPagination.total} 条记录，第 {rewardPagination.page}/{rewardPagination.totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPageChange(rewardPagination.page - 1)}
                      disabled={rewardPagination.page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                        bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </button>
                    {Array.from({ length: rewardPagination.totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        if (rewardPagination.totalPages <= 7) return true
                        return Math.abs(p - rewardPagination.page) <= 2 || p === 1 || p === rewardPagination.totalPages
                      })
                      .map((p, idx, arr) => {
                        const prev = arr[idx - 1]
                        const showEllipsis = prev && p - prev > 1
                        return (
                          <span key={p} className="flex items-center">
                            {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                            <button
                              onClick={() => onPageChange(p)}
                              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                p === rewardPagination.page
                                  ? 'bg-blue-600 text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {p}
                            </button>
                          </span>
                        )
                      })}
                    <button
                      onClick={() => onPageChange(rewardPagination.page + 1)}
                      disabled={rewardPagination.page >= rewardPagination.totalPages}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                        bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      下一页
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
    </>
  )
}