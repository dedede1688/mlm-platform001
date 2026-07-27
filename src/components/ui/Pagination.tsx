'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  total?: number
  numbers?: boolean
}

export function Pagination({ page, totalPages, onPageChange, total, numbers = false }: PaginationProps) {
  if (totalPages <= 1) return null

  const btnBase = "inline-flex items-center justify-center min-w-[36px] h-9 px-2 text-sm rounded-lg transition-colors"

  const pages: (number | "...")[] = []
  if (numbers && totalPages > 1) {
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push("...")
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
      if (page < totalPages - 2) pages.push("...")
      pages.push(totalPages)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 mt-6">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {total !== undefined && <span>共 {total} 条</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
          className={`${btnBase} border border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {numbers ? (
          pages.map((p, i) =>
            p === "..." ? (
              <span key={`dot-${i}`} className="px-1 text-gray-400 select-none">&#8230;</span>
            ) : (
              <button key={p} onClick={() => onPageChange(p)}
                className={`${btnBase} ${p === page ? "bg-primary text-white shadow-sm" : "border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                {p}
              </button>
            )
          )
        ) : (
          <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">{page} / {totalPages}</span>
        )}
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className={`${btnBase} border border-gray-200 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}