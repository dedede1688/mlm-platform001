'use client'

import { Search, ChevronLeft, ChevronRight, Loader2, ListChecks, CheckCircle, XCircle, DollarSign, Wallet, History } from 'lucide-react'
import { WithdrawalItem, Pagination } from '../page'

const LARGE_WITHDRAWAL_THRESHOLD = 5000

const WITHDRAWAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  approved:  { label: '已通过', color: 'bg-blue-50 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-50 text-green-700' },
  rejected:  { label: '已拒绝', color: 'bg-red-50 text-red-700' },
}

const WITHDRAWAL_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(WITHDRAWAL_STATUS_MAP).map(([value, info]) => ({ value, label: info.label })),
]

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

export interface WithdrawalsTabProps {
  token: string | null
  withdrawals: WithdrawalItem[]
  withdrawalPagination: Pagination
  withdrawalLoading: boolean
  withdrawalSearch: string
  withdrawalStatus: string
  selectedIds: string[]
  batchAction: 'approve' | 'reject'
  batchRejectReason: string
  batchRemark: string
  rejectTemplates: { id: string; title: string; content: string }[]
  selectedTemplateId: string
  setWithdrawalSearch: (v: string) => void
  setWithdrawalStatus: (v: string) => void
  setSelectedIds: (v: string[]) => void
  setBatchAction: (v: 'approve' | 'reject') => void
  setBatchRejectReason: (v: string) => void
  setBatchRemark: (v: string) => void
  setSelectedTemplateId: (v: string) => void
  setReviewModal: (v: { type: 'approve' | 'reject'; item: import('../page').WithdrawalItem } | null) => void
  setCompleteModal: (v: import('../page').WithdrawalItem | null) => void
  setLargeWithdrawalConfirm: (v: { item: import('../page').WithdrawalItem; type: 'approve' | 'reject' } | null) => void
  onSearch: () => void
  onPageChange: (page: number) => void
  onBatchReview: () => void
  onViewAuditLogs: (id: string) => void
  batching: boolean
  canApprove: boolean
  showMessage: (type: 'success' | 'error', text: string) => void
}

export default function WithdrawalsTab(props: WithdrawalsTabProps) {
  const {
    token: _token, withdrawals, withdrawalPagination, withdrawalLoading,
    withdrawalSearch, withdrawalStatus,
    selectedIds, batchAction, batchRejectReason, batchRemark,
    rejectTemplates, selectedTemplateId,
    setWithdrawalSearch, setWithdrawalStatus, setSelectedIds,
    setBatchAction, setBatchRejectReason, setBatchRemark, setSelectedTemplateId,
    setReviewModal, setCompleteModal, setLargeWithdrawalConfirm,
    onSearch, onPageChange, onBatchReview, onViewAuditLogs,
    batching, canApprove, showMessage,
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
                    value={withdrawalSearch}
                    onChange={e => setWithdrawalSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onSearch()}
                    placeholder="搜索手机号/昵称..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  />
                </div>
                <select
                  value={withdrawalStatus}
                  onChange={e => setWithdrawalStatus(e.target.value)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 hover:border-gray-400"
                >
                  {WITHDRAWAL_STATUS_OPTIONS.map(opt => (
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

            {/* 批量操作栏 */}
            {selectedIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
                <ListChecks className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">已选 {selectedIds.length} 条</span>
                <button onClick={() => setBatchAction('approve')} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${batchAction === 'approve' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'}`}>批量通过</button>
                <button onClick={() => setBatchAction('reject')} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${batchAction === 'reject' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'}`}>批量拒绝</button>
                {batchAction === 'reject' && (
                  <>
                    {rejectTemplates.length > 0 && (
                      <select value={selectedTemplateId} onChange={e => { setSelectedTemplateId(e.target.value); const t = rejectTemplates.find(t => t.id === e.target.value); if (t) setBatchRejectReason(t.content) }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900">
                        <option value="">选择模板...</option>
                        {rejectTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    )}
                    <input type="text" value={batchRejectReason} onChange={e => setBatchRejectReason(e.target.value)} placeholder="拒绝原因" className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" />
                  </>
                )}
                <input type="text" value={batchRemark} onChange={e => setBatchRemark(e.target.value)} placeholder="备注（选填）" className="flex-1 min-w-[150px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" />
                <button onClick={onBatchReview} disabled={batching} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors">
                  {batching ? '处理中...' : '执行'}
                </button>
                <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">取消</button>
              </div>
            )}

            {/* 提现列表 */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
              {withdrawalLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : withdrawals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Wallet className="w-12 h-12 mb-3" />
                  <p>暂无提现记录</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-10">
                          <input type="checkbox" checked={withdrawals.length > 0 && withdrawals.filter(w => w.status === 'pending').every(w => selectedIds.includes(w.id))} onChange={e => { const pendingIds = withdrawals.filter(w => w.status === 'pending').map(w => w.id); setSelectedIds(e.target.checked ? pendingIds : []) }} className="rounded border-gray-300" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">用户信息</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">提现金额</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">收款信息</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">申请时间</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">审核人</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {withdrawals.map(w => {
                        const statusInfo = WITHDRAWAL_STATUS_MAP[w.status] || { label: w.status, color: 'bg-gray-100 text-gray-500' }
                        return (
                          <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              {w.status === 'pending' ? (
                                <input type="checkbox" checked={selectedIds.includes(w.id)} onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, w.id] : selectedIds.filter(id => id !== w.id))} className="rounded border-gray-300" />
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{w.user.phone}</div>
                              {w.user.nickname && (
                                <div className="text-xs text-gray-400">{w.user.nickname}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-red-600 font-medium">¥{w.amount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {w.paymentMethod ? (
                                <div className="text-sm">
                                  <div className="text-gray-900">
                                    {w.paymentMethod === 'alipay' ? '支付宝' : w.paymentMethod === 'wechat' ? '微信' : w.paymentMethod === 'bank_card' ? '银行卡' : w.paymentMethod}
                                  </div>
                                  <div className="text-xs text-gray-500 font-mono">{w.accountNumber}</div>
                                  <div className="text-xs text-gray-400">{w.accountName}{w.bankName ? ` · ${w.bankName}` : ''}</div>
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{formatTime(w.createdAt)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                              {w.status === 'rejected' && w.rejectReason && (
                                <div className="text-xs text-red-400 mt-1">原因：{w.rejectReason}</div>
                              )}
                              {w.status === 'completed' && w.paidAt && (
                                <div className="text-xs text-gray-400 mt-1">打款时间：{formatTime(w.paidAt)}</div>
                              )}
                              {w.status === 'completed' && w.paymentProofUrl && (
                                <div className="text-xs text-blue-400 mt-0.5">
                                  <a href={w.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="underline">查看凭证</a>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {w.reviewer ? (w.reviewer.nickname || w.reviewer.phone) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {w.status === 'pending' ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        if (!canApprove) { showMessage('error', '您没有审批权限,请联系超级管理员'); return }
                                        if (w.amount >= LARGE_WITHDRAWAL_THRESHOLD) {
                                          setLargeWithdrawalConfirm({ item: w, type: 'approve' })
                                        } else {
                                          setReviewModal({ type: 'approve', item: w })
                                        }
                                      }}
                                      disabled={!canApprove}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-green-600
                                        hover:bg-green-50 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      通过
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!canApprove) { showMessage('error', '您没有审批权限,请联系超级管理员'); return }
                                        setReviewModal({ type: 'reject', item: w })
                                      }}
                                      disabled={!canApprove}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600
                                        hover:bg-red-50 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      拒绝
                                    </button>
                                  </>
                                ) : w.status === 'approved' ? (
                                  <button
                                    onClick={() => {
                                      if (!canApprove) { showMessage('error', '您没有操作权限,请联系超级管理员'); return }
                                      setCompleteModal(w)
                                    }}
                                    disabled={!canApprove}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600
                                      hover:bg-blue-50 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    完成打款
                                  </button>
                                ) : null}
                                <button
                                  onClick={() => onViewAuditLogs(w.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500
                                    hover:bg-gray-100 rounded-lg transition-colors"
                                  title="审核日志"
                                >
                                  <History className="w-3.5 h-3.5" />
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
              {!withdrawalLoading && withdrawalPagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-500">
                    共 {withdrawalPagination.total} 条记录，第 {withdrawalPagination.page}/{withdrawalPagination.totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPageChange(withdrawalPagination.page - 1)}
                      disabled={withdrawalPagination.page <= 1}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700
                        bg-white border border-gray-300 rounded-lg hover:bg-gray-50
                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </button>
                    {Array.from({ length: withdrawalPagination.totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        if (withdrawalPagination.totalPages <= 7) return true
                        return Math.abs(p - withdrawalPagination.page) <= 2 || p === 1 || p === withdrawalPagination.totalPages
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
                                p === withdrawalPagination.page
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
                      onClick={() => onPageChange(withdrawalPagination.page + 1)}
                      disabled={withdrawalPagination.page >= withdrawalPagination.totalPages}
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
