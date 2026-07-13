'use client'

import { useState, useEffect } from 'react'
import { Inbox, Eye, Loader2, User } from 'lucide-react'
import Link from 'next/link'

interface NotificationBatch {
  id: string
  type: string
  title: string
  content: string
  senderId: string | null
  recipientCount: number
  readCount: number
  status: string
  templateType: string | null
  createdAt: string
  sender: { id: string; nickname: string | null; phone: string | null } | null
}

const BATCH_TYPE_LABELS: Record<string, string> = {
  business: '业务通知',
  general: '通用通知',
  announcement: '系统公告',
}

export default function NotificationHistoryPage() {
  const [batches, setBatches] = useState<NotificationBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    fetchBatches()
  }, [page, typeFilter])

  async function fetchBatches() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (typeFilter) params.set('type', typeFilter)
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
      const res = await fetch(`/api/admin/notification-history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setBatches(data.data.batches)
        setTotalPages(data.data.pagination.totalPages)
      }
    } catch (err) {
      console.error('获取发件箱失败:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Inbox className="w-6 h-6 text-orange-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">通知发件箱</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          >
            <option value="">全部类型</option>
            <option value="business">业务通知</option>
            <option value="general">通用通知</option>
            <option value="announcement">系统公告</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : batches.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">暂无发送记录</div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">标题</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">类型</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">发送人</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">收件人</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">已读</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">阅读率</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">发送时间</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">操作</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const readRate = batch.recipientCount > 0
                  ? ((batch.readCount / batch.recipientCount) * 100).toFixed(1)
                  : '0.0'
                return (
                  <tr key={batch.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{batch.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{batch.content}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {BATCH_TYPE_LABELS[batch.type] || batch.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {batch.sender ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {batch.sender.nickname || batch.sender.phone}
                        </span>
                      ) : (
                        <span className="text-gray-400">系统</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{batch.recipientCount}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{batch.readCount}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${Number(readRate) >= 80 ? 'text-green-600' : Number(readRate) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {readRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(batch.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/notification-history/${batch.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        详情
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border dark:border-gray-600 disabled:opacity-50 dark:text-white"
          >
            上一页
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-300">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border dark:border-gray-600 disabled:opacity-50 dark:text-white"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}