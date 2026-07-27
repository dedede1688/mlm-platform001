'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** 可选：显示总条数 */
  total?: number
}

export function Pagination({ page, totalPages, onPageChange, total }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between gap-2 mt-6">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {total !== undefined && <span>共 {total} 条&nbsp;</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200"
        >
          <ChevronLeft className="w-4 h-4" />
          上一页
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[80px] text-center">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200"
        >
          下一页
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
