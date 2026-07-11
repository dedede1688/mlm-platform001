'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ArrowRight, AlertCircle } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import { formatMoney } from '@/lib/utils/format'

interface EarningsTransferModalProps {
  open: boolean
  onClose: () => void
  /** 当前可用收益 */
  earningsAvailable: number
  /** 当前购物余额 */
  balance: number
  /** 转入成功后回调（刷新数据） */
  onSuccess: () => void
}

export function EarningsTransferModal({
  open,
  onClose,
  earningsAvailable,
  balance,
  onSuccess,
}: EarningsTransferModalProps) {
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 弹窗打开时重置状态
  useEffect(() => {
    if (open) {
      setAmount('')
      setSubmitting(false)
      setErrorMsg('')
    }
  }, [open])

  if (!open) return null

  const numAmount = parseFloat(amount) || 0
  const exceedsMax = numAmount > earningsAvailable
  const isInvalid = numAmount <= 0 || exceedsMax

  const handleQuickAmount = (val: number) => {
    const capped = Math.min(val, earningsAvailable)
    setAmount(String(capped))
    setErrorMsg('')
  }

  const handleAllTransfer = () => {
    setAmount(String(earningsAvailable))
    setErrorMsg('')
  }

  const handleSubmit = async () => {
    setErrorMsg('')

    if (numAmount <= 0) {
      setErrorMsg('转入金额必须大于0')
      return
    }
    if (exceedsMax) {
      setErrorMsg('转入金额不能超过可用收益')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      setErrorMsg('请先登录')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/user/earnings-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: numAmount }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success(`收益 ¥${formatMoney(numAmount)} 已成功转入购物余额`)
        onSuccess()
        onClose()
      } else {
        // 失败：弹窗不关闭，显示后端错误
        setErrorMsg(data.error || data.message || '转入失败，请重试')
      }
    } catch (_error) {
      setErrorMsg('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">收益转入余额</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* 当前可用收益 + 购物余额 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">当前可用收益</p>
              <p className="text-xl font-bold text-orange-600">¥{formatMoney(earningsAvailable)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">当前购物余额</p>
              <p className="text-xl font-bold text-blue-600">¥{formatMoney(balance)}</p>
            </div>
          </div>

          {/* 流向示意 */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <span>可用收益</span>
            <ArrowRight className="w-3.5 h-3.5" />
            <span>购物余额</span>
          </div>

          {/* 输入转入金额 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              转入金额
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setErrorMsg('')
                }}
                placeholder="请输入转入金额"
                min="0.01"
                step="0.01"
                disabled={submitting}
                className={`w-full pl-8 pr-4 py-3 border rounded-lg
                  focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  transition-colors text-gray-900 placeholder-gray-400
                  disabled:bg-gray-50 disabled:cursor-not-allowed
                  ${exceedsMax ? 'border-red-300' : 'border-gray-300'}`}
              />
            </div>
            {exceedsMax && (
              <p className="text-xs text-red-500 mt-1">金额超过可用收益</p>
            )}
          </div>

          {/* 快捷按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAllTransfer}
              disabled={submitting || earningsAvailable <= 0}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              全部转入
            </button>
            {[100, 500, 1000].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleQuickAmount(val)}
                disabled={submitting || earningsAvailable <= 0}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ¥{val}
              </button>
            ))}
          </div>

          {/* 提示文字 */}
          <div className="flex items-start gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>转入后将进入购物余额，可用于购买商品。购物余额不能转回收益。</span>
          </div>

          {/* 错误信息 */}
          {errorMsg && (
            <div className="flex items-start gap-1.5 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || isInvalid || earningsAvailable <= 0}
            className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? '转入中...' : '确认转入'}
          </button>
        </div>
      </div>
    </div>
  )
}
