'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle, Loader2, ChevronRight } from 'lucide-react'

interface Notification {
  id: string
  type: string
  title: string
  content: string
  isRead: boolean
  sourceType: string | null
  sourceId: string | null
  createdAt: string
}

export default function NotificationsPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t) { setToken(t); fetchNotifications(t, 1) }
  }, [])

  const fetchNotifications = async (authToken: string, p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?page=${p}&limit=20`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const data = await res.json()
      if (data.success) {
        setNotifications(data.data.notifications || [])
        setUnreadCount(data.data.unreadCount || 0)
        setTotalPages(data.data.pagination?.totalPages || 1)
        setPage(p)
      }
    } catch {}
    finally { setLoading(false) }
  }

  const handleMarkRead = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch {}
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">站内信</h1>
        {unreadCount > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {unreadCount} 条未读
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /><span className="ml-2 text-gray-500">加载中...</span></div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center text-gray-400">
          <Bell className="w-12 h-12 mx-auto mb-3" />
          <p>暂无通知</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => {
            // v69: 支持点击通知跳转到对应订单详情
            const canNavigate = n.sourceType === 'refund' && n.sourceType
            const handleClick = () => {
              if (canNavigate && n.sourceId) {
                router.push(`/dashboard/orders/${n.sourceId}`)
              }
            }
            return (
            <div
              key={n.id}
              className={`bg-white rounded-xl shadow-sm p-5 transition-colors ${n.isRead ? 'border border-gray-200' : 'border-l-4 border-l-blue-500 border border-blue-100 bg-blue-50/30'} ${canNavigate ? 'cursor-pointer hover:shadow-md hover:border-blue-200' : ''}`}
              onClick={handleClick}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">{n.title}</h3>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{n.content}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{formatTime(n.createdAt)}</span>
                    {canNavigate && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-blue-500 font-medium">
                        查看订单
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!n.isRead && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id) }}
                      className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> 标记已读
                    </button>
                  )}
                </div>
              </div>
            </div>
            )
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-4">
              <button onClick={() => fetchNotifications(token!, page - 1)} disabled={page <= 1} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">上一页</button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button onClick={() => fetchNotifications(token!, page + 1)} disabled={page >= totalPages} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">下一页</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}