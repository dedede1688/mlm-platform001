'use client'

import { createContext, useContext, ReactNode } from 'react'

// 最简 toast 实现：基于浏览器 alert（后续可替换为 sonner 等库）
interface ToastApi {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast: ToastApi = {
    success: (msg) => { if (typeof window !== 'undefined') alert('✅ ' + msg) },
    error: (msg) => { if (typeof window !== 'undefined') alert('❌ ' + msg) },
    info: (msg) => { if (typeof window !== 'undefined') alert('ℹ️ ' + msg) },
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// 兼容现有代码中 `import { toast } from '@/components/ToastProvider'` 的用法
// 提供一个单例 toast 对象，无需 Provider 也能工作
export const toast: ToastApi = {
  success: (msg) => { if (typeof window !== 'undefined') alert('✅ ' + msg) },
  error: (msg) => { if (typeof window !== 'undefined') alert('❌ ' + msg) },
  info: (msg) => { if (typeof window !== 'undefined') alert('ℹ️ ' + msg) },
}