'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
        <div className="text-6xl text-red-500 mb-4">!</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">出错了</h2>
        <p className="text-gray-600 mb-6">
          应用遇到了意外错误，请刷新页面重试。
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            刷新页面
          </button>
          <Link
            href="/"
            className="block w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  )
}
