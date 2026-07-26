'use client'

import { Search, ChevronLeft, ChevronRight, Loader2, History, ArrowDownCircle, CheckCircle, XCircle } from 'lucide-react'
import { RechargeItem, Pagination } from '../page'

const RECHARGE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  approved: { label: '已通过', color: 'bg-green-50 text-green-700' },
  rejected: { label: '已拒绝', color: 'bg-red-50 text-red-700' },
}

const RECHARGE_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(RECHARGE_STATUS_MAP).map(([value, info]) => ({ value, label: info.label })),
]

const RECHARGE_PAYMENT_METHOD_MAP: Record<string, string> = {
  qr_code: '二维码扫码充值',
  alipay: '支付宝',
  wechat: '微信',
  bank_card: '银行卡',
  other: '其他',
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

const METHOD_LABEL_MAP: Record<string, string> = {
  bank: '银行转账',
  wechat: '微信支付',
  alipay: '支付宝',
  manual: '手动',
}

export interface RechargeTabProps {
  token: string | null
  recharges: RechargeItem[]
  rechargePagination: Pagination
  rechargeLoading: boolean
  rechargeSearch: string
  rechargeStatus: string
  canApprove: boolean
  setRechargeSearch: (v: string) => void
  setRechargeStatus: (v: string) => void
  setRechargeReviewModal: (v: { type: 'approve' | 'reject'; item: import('../page').RechargeItem } | null) => void
  onSearch: () => void
  onPageChange: (page: number) => void
  onViewAuditLogs: (id: string) => void
  openProofViewer: (url: string) => void
}

export default function RechargeTab(props: RechargeTabProps) {
  const {
    token, recharges, rechargePagination, rechargeLoading,
    rechargeSearch, rechargeStatus, canApprove,
    setRechargeSearch, setRechargeStatus, setRechargeReviewModal,
    onSearch, onPageChange, onViewAuditLogs, openProofViewer,
  } = props

  return (
    <>
            {/* 筛选栏 */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={rechargeSearch}
                    onChange={e => setRechargeSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onSearch()}
                    placeholder="搜索手机号/昵称..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  />
                </div>
                <select
                  value={rechargeStatus}
                  onChange={e => setRechargeStatus(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400"
                >
                  {RECHARGE_STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={onSearch}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                    transition-colors font-medium whitespace-nowrap"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* 充值列表 */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
              {rechargeLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : recharges.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <ArrowDownCircle className="w-12 h-12 mb-3" />
                  <p>暂无充值申请</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户信息</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">充值金额</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">支付方式</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">付款凭证</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">申请时间</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">审核时间</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">审核人</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recharges.map(r => {
                        const statusInfo = RECHARGE_STATUS_MAP[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-500' }
                        const methodLabel = RECHARGE_PAYMENT_METHOD_MAP[r.paymentMethod] || r.paymentMethod
                        return (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{r.user.phone}</div>
                              {r.user.nickname && (
                                <div className="text-xs text-gray-400">{r.user.nickname}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-green-600 font-medium">¥{r.amount.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{methodLabel}</td>
                            <td className="px-4 py-3">
                              {r.paymentProofUrl ? (
                                <button
                                  onClick={() => openProofViewer(r.paymentProofUrl)}
                                  className="text-blue-600 hover:text-blue-700 text-sm underline"
                                >
                                  查看凭证
                                </button>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                              {r.status === 'rejected' && r.rejectReason && (
                                <div className="text-xs text-red-400 mt-1">原因：{r.rejectReason}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatTime(r.createdAt)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatTime(r.reviewedAt)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {r.reviewer ? (r.reviewer.nickname || r.reviewer.phone) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {r.status === 'pending' ? (
                                  <>
                                    <button
                                      onClick={() => setRechargeReviewModal({ type: 'approve', item: r })}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-600
                                        hover:bg-green-50 rounded-lg transition-colors font-medium"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      通过
                                    </button>
                                    <button
                                      onClick={() => setRechargeReviewModal({ type: 'reject', item: r })}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600
                                        hover:bg-red-50 rounded-lg transition-colors font-medium"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      拒绝
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-sm text-gray-400">已处理</span>
                                )}
                                <button
                                  onClick={() => onViewAuditLogs(r.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500
                                    hover:bg-gray-100 rounded-lg transition-colors"
                                  title="充值审核日志"
                                >
                                  <History className="w-3.5 h-3.5" />
                                  日志
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 分页 */}
              {!rechargeLoading && rechargePagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-500">
                    共 {rechargePagination.total} 条记录，第 {rechargePagination.page}/{rechargePagination.totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPageChange(rechargePagination.page - 1)}
                      disabled={rechargePagination.page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                        bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </button>
                    {Array.from({ length: rechargePagination.totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        if (rechargePagination.totalPages <= 7) return true
                        return Math.abs(p - rechargePagination.page) <= 2 || p === 1 || p === rechargePagination.totalPages
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
                                p === rechargePagination.page
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
                      onClick={() => onPageChange(rechargePagination.page + 1)}
                      disabled={rechargePagination.page >= rechargePagination.totalPages}
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
