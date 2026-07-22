'use client'

import { useState } from 'react'
import { X, Loader2, ShieldCheck } from 'lucide-react'

interface PaymentPasswordModalProps {
  open: boolean
  loading?: boolean
  onConfirm: (password: string) => void
  onCancel: () => void
}

export default function PaymentPasswordModal({
  open,
  loading = false,
  onConfirm,
  onCancel,
}: PaymentPasswordModalProps) {
  const [password, setPassword] = useState('')

  if (!open) return null

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(password)
      setPassword('')
    }
  }

  const handleCancel = () => {
    setPassword('')
    onCancel()
  }

  const isValid = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/.test(password)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-600" />
            <span className="text-lg font-semibold text-gray-900">请输入支付密码</span>
          </div>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 输入框 */}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value.slice(0, 20))}
          placeholder="至少6位，需含字母和数字"
          maxLength={20}
          autoFocus
          className="w-full px-4 py-3.5 border border-gray-300 rounded-xl text-center text-lg font-mono
            focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
        />

        {/* 提示 */}
        <p className="text-xs text-gray-400 mt-3 mb-4 text-center">
          支付密码用于确认交易，请勿泄露
        </p>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm
              hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !isValid}
            className={`flex-1 py-2.5 rounded-xl text-white font-medium text-sm transition-all
              ${isValid && !loading
                ? 'bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-500/25'
                : 'bg-orange-300 cursor-not-allowed'}`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                处理中
              </span>
            ) : (
              '确认支付'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
