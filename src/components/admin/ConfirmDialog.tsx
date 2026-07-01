'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

// v68.5:通用二次确认对话框
// 支持 3 种模式:
//  1. 普通确认(default):点"确认"即可
//  2. 输确认词(confirmText):要输入指定文本才能点(防止误操作)
//  3. 大额提示(emphasize):红色强调,适合删除/大额退款

export type ConfirmMode = 'default' | 'confirmText' | 'emphasize'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string | React.ReactNode
  confirmText?: string            // 按钮文字,默认"确认"
  cancelText?: string             // 取消按钮文字,默认"取消"
  mode?: ConfirmMode               // 默认 'default'
  expectedInput?: string           // mode='confirmText' 时必须输入此文本
  loading?: boolean                // 外部传入的 loading 状态
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  mode = 'default',
  expectedInput,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [input, setInput] = useState('')

  useEffect(() => {
    if (open) setInput('')
  }, [open])

  if (!open) return null

  const canConfirm =
    !loading &&
    (mode !== 'confirmText' || input.trim() === (expectedInput || ''))

  const buttonClass =
    mode === 'emphasize'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-blue-600 hover:bg-blue-700'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className={`px-6 py-4 flex items-start gap-3 ${
          mode === 'emphasize'
            ? 'bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100'
            : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100'
        }`}>
          <AlertTriangle className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
            mode === 'emphasize' ? 'text-red-600' : 'text-blue-600'
          }`} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 rounded hover:bg-white/40 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 text-sm text-gray-700">
          {typeof message === 'string'
            ? <p className="leading-relaxed">{message}</p>
            : message
          }

          {mode === 'confirmText' && expectedInput && (
            <div className="mt-4">
              <label className="block text-xs text-gray-600 mb-1.5">
                请输入 <code className="px-1.5 py-0.5 bg-gray-100 rounded text-red-600 font-mono">{expectedInput}</code> 以确认:
              </label>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={expectedInput}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-3 bg-gray-50 border-t flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-5 py-2 text-sm text-white rounded-lg transition-colors font-medium flex items-center gap-1.5 disabled:opacity-50 ${buttonClass}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
