'use client'

import { useEffect, useState, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
}

let globalAddToast: ((type: ToastType, message: string) => void) | null = null

// 全局调用函数（可在任何地方调用）
export const toast = {
  success: (message: string) => globalAddToast?.('success', message),
  error: (message: string) => globalAddToast?.('error', message),
  info: (message: string) => globalAddToast?.('info', message),
  warning: (message: string) => globalAddToast?.('warning', message),
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
}

const COLORS: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

const ICON_COLORS: Record<ToastType, string> = {
  success: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  info: 'bg-blue-500 text-white',
  warning: 'bg-amber-500 text-white',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    globalAddToast = addToast
    return () => { globalAddToast = null }
  }, [addToast])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <>
      {children}
      {/* Toast 容器 */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg pointer-events-auto
              animate-[slideIn_0.2s_ease-out] ${COLORS[t.type]}`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${ICON_COLORS[t.type]}`}>
              {ICONS[t.type]}
            </span>
            <span className="text-sm font-medium flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
