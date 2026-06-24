'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Inbox, User, CheckCircle, Circle, Loader2 } from 'lucide-react'

interface BatchDetail {
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
  notifications: Array<{
    id: string
    userId: string
    isRead: boolean
    createdAt: string
    user: { id: string; nickname: string | null; phone: string | null }
  }>
}

const BATCH_TYPE_LABELS: Record<string, string> = {
  business: '业务通知',
  general: '通用通知',
  announcement: '系统公告',
}

export default function BatchDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [batch, setBatch] = useState<BatchDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBatch()
  }, [])

  async function fetchBatch() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/notification-history/${params.id}`)
      const data = await res.json()
      if (data.success) {
        setBatch(data.data)
      }
    } catch (err) {
      console.error('获取批次详情失败:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        批次不存在
        <button onClick={() => router.push('/admin/notification-history')} className="block mx-auto mt-4 text-orange-500 hover:underline">
          返回发件箱
        </button>
      </div>
    )
  }

  const readRate = batch.recipientCount > 0
    ? ((batch.readCount / batch.recipientCount) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/admin/notification-history')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <Inbox className="w-6 h-6 text-orange-500" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">批次详情</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">类型</div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {BATCH_TYPE_LABELS[batch.type] || batch.type}
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">收件人</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">{batch.recipientCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">已读</div>
          <div className="text-lg font-bold text-green-600">{batch.readCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">阅读率</div>
          <div className={`text-lg font-bold ${Number(readRate) >= 80 ? 'text-green-600' : Number(readRate) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
            {readRate}%
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 mb-6">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">标题</div>
        <div className="text-sm font-medium text-gray-900 dark:text-white mb-3">{batch.title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">内容</div>
        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{batch.content}</div>
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
          <span>发送人：{batch.sender ? batch.sender.nickname || batch.sender.phone : '系统'}</span>
          <span>发送时间：{new Date(batch.createdAt).toLocaleString('zh-CN')}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700">
        <div className="px-4 py-3 border-b dark:border-gray-700">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">收件人明细</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-300">用户</th>
              <th className="px-4 py-2.5 text-center font-medium text-gray-600 dark:text-gray-300">阅读状态</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-300">接收时间</th>
            </tr>
          </thead>
          <tbody>
            {batch.notifications.map((n) => (
              <tr key={n.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-gray-900 dark:text-white">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    {n.user.nickname || n.user.phone}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {n.isRead ? (
                    <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                      <CheckCircle className="w-3.5 h-3.5" /> 已读
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                      <Circle className="w-3.5 h-3.5" /> 未读
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                  {new Date(n.createdAt).toLocaleString('zh-CN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}