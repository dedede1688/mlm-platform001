'use client'

import { useState, useRef } from 'react'
import {
  Loader2, X, DollarSign, Gift,
  ZoomIn, ZoomOut, Minimize2, ImageOff, AlertTriangle, CheckCircle, XCircle
} from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import type { RechargeItem, RechargeAuditLog, WithdrawalItem } from '../page'
import { LARGE_WITHDRAWAL_THRESHOLD, RECHARGE_PAYMENT_METHOD_MAP, RECHARGE_AUDIT_ACTION_MAP, RECHARGE_AUDIT_STATUS_MAP } from './financeConstants'

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface FinanceModalsProps {
  rechargeReviewModal: { type: 'approve' | 'reject'; item: RechargeItem } | null
  onRechargeReviewClose: () => void
  rechargeRejectReason: string
  onRechargeRejectReasonChange: (v: string) => void
  rechargeReviewRemark: string
  onRechargeReviewRemarkChange: (v: string) => void
  rechargeReviewLoading: boolean
  onRechargeReviewSubmit: () => void
  rechargeAuditModalId: string | null
  onRechargeAuditModalClose: () => void
  rechargeAuditLogs: RechargeAuditLog[]
  rechargeAuditLoading: boolean
  proofViewerUrl: string | null
  onProofViewerClose: () => void
  reviewModal: { type: 'approve' | 'reject'; item: WithdrawalItem } | null
  onReviewModalClose: () => void
  rejectReason: string
  onRejectReasonChange: (v: string) => void
  reviewRemark: string
  onReviewRemarkChange: (v: string) => void
  reviewing: boolean
  onReviewSubmit: () => void
  rejectTemplates: { id: string; title: string; content: string }[]
  selectedTemplateId: string
  onSelectedTemplateIdChange: (v: string) => void
  auditModalId: string | null
  onAuditModalClose: () => void
  auditLogs: { id: string; action: string; createdAt: string; oldStatus?: string; newStatus?: string; reason?: string; remark?: string; user?: { nickname?: string } }[]
  auditLoading: boolean
  manualModal: boolean
  onManualModalClose: () => void
  manualPhone: string
  onManualPhoneChange: (v: string) => void
  manualAmount: string
  onManualAmountChange: (v: string) => void
  manualReason: string
  onManualReasonChange: (v: string) => void
  manualSubmitting: boolean
  onManualRewardSubmit: () => void
  largeWithdrawalConfirm: { item: WithdrawalItem; type: 'approve' | 'reject' } | null
  onLargeWithdrawalConfirm: () => void
  onLargeWithdrawalCancel: () => void
  completeModal: WithdrawalItem | null
  onCompleteModalClose: () => void
  paymentProofUrl: string
  onPaymentProofUrlChange: (v: string) => void
  completeRemark: string
  onCompleteRemarkChange: (v: string) => void
  completing: boolean
  onCompleteSubmit: () => void
  openProofViewer: (url: string) => void
}


export default function FinanceModals(props: FinanceModalsProps) {
  const p = props

  const [proofViewerScale, setProofViewerScale] = useState(1)
  const [proofViewerOffset, setProofViewerOffset] = useState({ x: 0, y: 0 })
  const [proofViewerDragging, setProofViewerDragging] = useState(false)
  const [proofViewerError, setProofViewerError] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

  const handleProofWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setProofViewerScale(prev => Math.min(4, Math.max(0.5, prev + delta)))
  }

  const handleProofMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setProofViewerDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY, offsetX: proofViewerOffset.x, offsetY: proofViewerOffset.y }
  }

  const handleProofMouseMove = (e: React.MouseEvent) => {
    if (!proofViewerDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setProofViewerOffset({ x: dragStartRef.current.offsetX + dx, y: dragStartRef.current.offsetY + dy })
  }

  const handleProofMouseUp = () => { setProofViewerDragging(false) }

  const resetProofViewer = () => {
    setProofViewerScale(1)
    setProofViewerOffset({ x: 0, y: 0 })
    setProofViewerDragging(false)
    setProofViewerError(false)
  }

  return (
    <>
      {/* Recharge Review Modal */}
      {p.rechargeReviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={p.onRechargeReviewClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {p.rechargeReviewModal.type === 'approve' ? '确认通过充值' : '拒绝充值申请'}
            </h3>
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">用户</span>
                <span className="text-gray-900">{p.rechargeReviewModal.item.user.phone}</span>
              </div>
              {p.rechargeReviewModal.item.user.nickname && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">昵称</span>
                  <span className="text-gray-900">{p.rechargeReviewModal.item.user.nickname}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">充值金额</span>
                <span className="text-green-600 font-medium">¥{p.rechargeReviewModal.item.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">支付方式</span>
                <span className="text-gray-900">
                  {RECHARGE_PAYMENT_METHOD_MAP[p.rechargeReviewModal.item.paymentMethod] || p.rechargeReviewModal.item.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">付款凭证</span>
                {p.rechargeReviewModal.item.paymentProofUrl ? (
                  <button onClick={() => p.openProofViewer(p.rechargeReviewModal!.item.paymentProofUrl)} className="text-blue-600 hover:text-blue-700 underline">
                    查看凭证
                  </button>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">申请时间</span>
                <span className="text-gray-900">{formatTime(p.rechargeReviewModal.item.createdAt)}</span>
              </div>
            </div>
            {p.rechargeReviewModal.type === 'approve' ? (
              <p className="text-sm text-gray-500 mb-5">审核通过后，充值金额将计入用户余额。</p>
            ) : (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">拒绝原因 <span className="text-red-500">*</span></label>
                <textarea value={p.rechargeRejectReason} onChange={e => p.onRechargeRejectReasonChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400 resize-none"
                  rows={3} placeholder="请输入拒绝原因..." autoFocus />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（选填）</label>
              <input type="text" value={p.rechargeReviewRemark} onChange={e => p.onRechargeReviewRemarkChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="审核备注..." />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={p.onRechargeReviewClose} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
              <button onClick={p.onRechargeReviewSubmit} disabled={p.rechargeReviewLoading}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium transition-all ${
                  p.rechargeReviewModal.type === 'approve'
                    ? p.rechargeReviewLoading ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-sm'
                    : p.rechargeReviewLoading ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-sm'
                }`}>
                {p.rechargeReviewLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {p.rechargeReviewModal.type === 'approve' ? '确认通过' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recharge Audit Logs Modal */}
      {p.rechargeAuditModalId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={p.onRechargeAuditModalClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">充值审核日志</h3>
              <button onClick={p.onRechargeAuditModalClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {p.rechargeAuditLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /><span className="ml-2 text-gray-500">加载中...</span></div>
            ) : p.rechargeAuditLogs.length === 0 ? (
              <p className="text-gray-400 text-center py-10">暂无日志</p>
            ) : (
              <div className="space-y-3">
                {p.rechargeAuditLogs.map((log) => {
                  const actionLabel = RECHARGE_AUDIT_ACTION_MAP[log.action] || log.action
                  const oldStatusLabel = log.oldStatus ? (RECHARGE_AUDIT_STATUS_MAP[log.oldStatus] || log.oldStatus) : '-'
                  const newStatusLabel = log.newStatus ? (RECHARGE_AUDIT_STATUS_MAP[log.newStatus] || log.newStatus) : '-'
                  return (
                    <div key={log.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.action === 'approve' ? 'bg-green-100 text-green-700' : log.action === 'reject' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{actionLabel}</span>
                        <span className="text-gray-400 text-xs">{formatTime(log.createdAt)}</span>
                      </div>
                      <div className="space-y-1 text-gray-600">
                        {log.operator && (<div><span className="text-gray-400">操作人：</span><span className="text-gray-700">{log.operator.phone}{log.operator.nickname ? ' (' + log.operator.nickname + ')' : ''}</span></div>)}
                        {log.oldStatus && log.newStatus && <div><span className="text-gray-400">状态：</span><span>{oldStatusLabel} → {newStatusLabel}</span></div>}
                        {log.reason && <div><span className="text-gray-400">原因：</span><span className="text-red-500">{log.reason}</span></div>}
                        {log.remark && <div><span className="text-gray-400">备注：</span><span className="text-blue-500">{log.remark}</span></div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proof Viewer Modal */}
      {p.proofViewerUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={p.onProofViewerClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-base font-semibold text-gray-900">付款凭证</h3>
              <button onClick={p.onProofViewerClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex items-center gap-2 px-5 py-2 border-b bg-gray-50">
              <button onClick={() => setProofViewerScale(prev => Math.min(4, prev + 0.25))} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"><ZoomIn className="w-4 h-4" />放大</button>
              <button onClick={() => setProofViewerScale(prev => Math.max(0.5, prev - 0.25))} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"><ZoomOut className="w-4 h-4" />缩小</button>
              <button onClick={resetProofViewer} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"><Minimize2 className="w-4 h-4" />适应窗口</button>
            </div>
            <div className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 relative"
              style={{ minHeight: '300px', maxHeight: 'calc(90vh - 120px)', cursor: proofViewerDragging ? 'grabbing' : 'grab' }}
              onWheel={handleProofWheel} onMouseDown={handleProofMouseDown} onMouseMove={handleProofMouseMove} onMouseUp={handleProofMouseUp} onMouseLeave={handleProofMouseUp}>
              {proofViewerError ? (
                <div className="flex flex-col items-center justify-center text-gray-400"><ImageOff className="w-12 h-12 mb-3" /><p className="text-sm">图片加载失败，请检查凭证链接</p></div>
              ) : (
                <img src={p.proofViewerUrl} alt="付款凭证" draggable={false} onError={() => setProofViewerError(true)}
                  style={{ transform: `scale(${proofViewerScale}) translate(${proofViewerOffset.x / proofViewerScale}px, ${proofViewerOffset.y / proofViewerScale}px)`, transition: proofViewerDragging ? 'none' : 'transform 0.1s ease-out', maxWidth: '100%', maxHeight: '100%', userSelect: 'none', pointerEvents: 'none' }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Review Modal */}
      {p.reviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={p.onReviewModalClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {p.reviewModal.type === 'approve' ? '确认通过提现' : '拒绝提现申请'}
            </h3>
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">用户</span><span className="text-gray-900">{p.reviewModal.item.user.phone}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">提现金额</span><span className="text-red-600 font-medium">¥{p.reviewModal.item.amount.toFixed(2)}</span></div>
              {p.reviewModal.item.paymentMethod && (<>
                <div className="flex justify-between text-sm"><span className="text-gray-500">收款方式</span><span className="text-gray-900">{p.reviewModal.item.paymentMethod === 'alipay' ? '支付宝' : p.reviewModal.item.paymentMethod === 'wechat' ? '微信' : p.reviewModal.item.paymentMethod === 'bank_card' ? '银行卡' : p.reviewModal.item.paymentMethod}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">收款账号</span><span className="text-gray-900 font-mono">{p.reviewModal.item.accountNumber}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">收款人</span><span className="text-gray-900">{p.reviewModal.item.accountName}</span></div>
                {p.reviewModal.item.bankName && (<div className="flex justify-between text-sm"><span className="text-gray-500">开户银行</span><span className="text-gray-900">{p.reviewModal.item.bankName}</span></div>)}
              </>)}
              <div className="flex justify-between text-sm"><span className="text-gray-500">申请时间</span><span className="text-gray-900">{formatTime(p.reviewModal.item.createdAt)}</span></div>
            </div>
            {p.reviewModal.type === 'approve' ? (
              <p className="text-sm text-gray-500 mb-5">审核通过后状态变为「已审核通过」，等待财务线下打款。审核通过不会直接扣款，需后续在「完成打款」操作中上传凭证。</p>
            ) : (
              <div className="mb-5">
                {p.rejectTemplates.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">快捷模板</label>
                    <select value={p.selectedTemplateId}
                      onChange={e => { p.onSelectedTemplateIdChange(e.target.value); const t = p.rejectTemplates.find(t => t.id === e.target.value); if (t) p.onRejectReasonChange(t.content) }}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 hover:border-gray-400">
                      <option value="">选择模板...</option>
                      {p.rejectTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                )}
                <label className="block text-sm font-medium text-gray-700 mb-1.5">拒绝原因 <span className="text-red-500">*</span></label>
                <textarea value={p.rejectReason} onChange={e => p.onRejectReasonChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400 resize-none"
                  rows={3} placeholder="请输入拒绝原因..." autoFocus />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（选填）</label>
              <input type="text" value={p.reviewRemark} onChange={e => p.onReviewRemarkChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400" placeholder="审核备注..." />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={p.onReviewModalClose} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
              <button onClick={p.onReviewSubmit} disabled={p.reviewing}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium transition-all ${
                  p.reviewModal.type === 'approve'
                    ? p.reviewing ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-sm'
                    : p.reviewing ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-sm'
                }`}>
                {p.reviewing && <Loader2 className="w-4 h-4 animate-spin" />}
                {p.reviewModal.type === 'approve' ? '确认通过' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Modal */}
      {p.auditModalId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={p.onAuditModalClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">审核日志</h3>
              <button onClick={p.onAuditModalClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {p.auditLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /><span className="ml-2 text-sm text-gray-500">加载中...</span></div>
            ) : p.auditLogs.length === 0 ? (
              <p className="text-gray-400 text-center py-10">暂无日志</p>
            ) : (
              <div className="space-y-3">
                {p.auditLogs.map((log: { id: string; action: string; createdAt: string; oldStatus?: string; newStatus?: string; reason?: string; remark?: string; user?: { nickname?: string } }) => (
                  <div key={log.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.action === 'approve' ? 'bg-green-100 text-green-700' : log.action === 'reject' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>{log.action === 'approve' ? '通过' : log.action === 'reject' ? '拒绝' : '完成打款'}</span>
                      <span className="text-gray-400 text-xs">{formatTime(log.createdAt)}</span>
                    </div>
                    <div className="text-gray-600">
                      {log.oldStatus && log.newStatus && <span>{log.oldStatus} → {log.newStatus}</span>}
                      {log.reason && <span className="ml-2 text-red-500">原因：{log.reason}</span>}
                      {log.remark && <span className="ml-2 text-blue-500">备注：{log.remark}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Reward Modal */}
      {p.manualModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={p.onManualModalClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">手动发放奖励</h3>
              <button onClick={p.onManualModalClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">用户手机号 <span className="text-red-500">*</span></label>
                <input type="text" value={p.manualPhone} onChange={e => p.onManualPhoneChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                  placeholder="请输入用户手机号" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">发放金额 <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                  <input type="number" value={p.manualAmount} onChange={e => p.onManualAmountChange(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                    placeholder="0.00" min="0.01" step="0.01" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">发放原因 <span className="text-red-500">*</span></label>
                <textarea value={p.manualReason} onChange={e => p.onManualReasonChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400 resize-none"
                  rows={3} placeholder="请输入发放原因..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={p.onManualModalClose} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
              <button onClick={p.onManualRewardSubmit} disabled={p.manualSubmitting}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium transition-all ${
                  p.manualSubmitting ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-sm'
                }`}>
                {p.manualSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <Gift className="w-4 h-4" />确认发放
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large Withdrawal Confirm */}
      <ConfirmDialog
        open={!!p.largeWithdrawalConfirm}
        title="大额提现确认"
        mode="emphasize"
        confirmText="我已确认,执行"
        cancelText="取消"
        onConfirm={p.onLargeWithdrawalConfirm}
        onCancel={p.onLargeWithdrawalCancel}
        message={
          p.largeWithdrawalConfirm && (
            <div className="space-y-2">
              <p>这是一笔 <b className="text-red-600">¥{p.largeWithdrawalConfirm.item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b> 的大额提现，超过 ¥{LARGE_WITHDRAWAL_THRESHOLD.toLocaleString('zh-CN')} 阈值。</p>
              <p>请确认:</p>
              <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                <li>用户: <b>{p.largeWithdrawalConfirm.item.user.phone}</b> ({p.largeWithdrawalConfirm.item.user.nickname || '无昵称'})</li>
                <li>账号: {p.largeWithdrawalConfirm.item.accountName || '-'} / {p.largeWithdrawalConfirm.item.bankName || p.largeWithdrawalConfirm.item.accountNumber || '-'}</li>
              </ul>
              <p className="text-red-600 font-medium pt-2"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 此操作涉及真实资金，确认无误后再点确认。</p>
            </div>
          )
        }
      />

      {/* Complete Payment Modal */}
      {p.completeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={p.onCompleteModalClose} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">完成提现打款</h3>
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">用户</span><span className="text-gray-900">{p.completeModal.user.phone}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">提现金额</span><span className="text-red-600 font-medium">¥{p.completeModal.amount.toFixed(2)}</span></div>
              {p.completeModal.paymentMethod && (<>
                <div className="flex justify-between text-sm"><span className="text-gray-500">收款方式</span><span className="text-gray-900">{p.completeModal.paymentMethod === 'alipay' ? '支付宝' : p.completeModal.paymentMethod === 'wechat' ? '微信' : p.completeModal.paymentMethod === 'bank_card' ? '银行卡' : p.completeModal.paymentMethod}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">收款账号</span><span className="text-gray-900 font-mono">{p.completeModal.accountNumber}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">收款人</span><span className="text-gray-900">{p.completeModal.accountName}</span></div>
                {p.completeModal.bankName && (<div className="flex justify-between text-sm"><span className="text-gray-500">开户银行</span><span className="text-gray-900">{p.completeModal.bankName}</span></div>)}
              </>)}
            </div>
            <p className="text-sm text-blue-600 mb-4">确认打款后，将从用户冻结收益中扣除 ¥{p.completeModal.amount.toFixed(2)}。</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">打款凭证 URL <span className="text-red-500">*</span></label>
              <input type="text" value={p.paymentProofUrl} onChange={e => p.onPaymentProofUrlChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                placeholder="请输入打款凭证图片地址或转账截图 URL" autoFocus />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（选填）</label>
              <input type="text" value={p.completeRemark} onChange={e => p.onCompleteRemarkChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400" placeholder="打款备注..." />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={p.onCompleteModalClose} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
              <button onClick={p.onCompleteSubmit} disabled={p.completing}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium transition-all ${
                  p.completing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
                }`}>
                {p.completing && <Loader2 className="w-4 h-4 animate-spin" />}
                <DollarSign className="w-4 h-4" />确认完成打款
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
