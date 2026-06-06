'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Loader2, ChevronLeft, ChevronRight, Filter
} from 'lucide-react'

// ---- 类型定义 ----

interface LogUser {
  id: string
  phone: string
  nickname: string | null
  role: string
}

interface OperationLog {
  id: string
  userId: string
  action: string
  module: string
  targetId: string | null
  oldValue: unknown
  newValue: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
  user: LogUser
}

// ---- 常量 ----

const MODULE_OPTIONS = [
  { value: '', label: '全部模块' },
  { value: 'product', label: '商品' },
  { value: 'order', label: '订单' },
  { value: 'user', label: '会员' },
  { value: 'finance', label: '财务' },
  { value: 'setting', label: '设置' },
]

const ACTION_OPTIONS = [
  { value: '', label: '全部操作' },
  { value: 'CREATE', label: '创建' },
  { value: 'UPDATE', label: '更新' },
  { value: 'DELETE', label: '删除' },
  { value: 'APPROVE', label: '审批通过' },
  { value: 'REJECT', label: '审批拒绝' },
]

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  APPROVE: 'bg-emerald-100 text-emerald-700',
  REJECT: 'bg-orange-100 text-orange-700',
}

const MODULE_LABELS: Record<string, string> = {
  product: '商品',
  order: '订单',
  user: '会员',
  finance: '财务',
  setting: '设置',
}

// ---- 主组件 ----

export default function OperationLogsPage() {
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // 筛选条件
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterUserId, setFilterUserId] = useState('')

  // 详情弹窗
  const [detailLog, setDetailLog] = useState<OperationLog | null>(null)

  // 获取日志列表
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (filterModule) params.set('module', filterModule)
      if (filterAction) params.set('action', filterAction)
      if (filterUserId) params.set('userId', filterUserId)
      if (filterStartDate) params.set('startDate', filterStartDate)
      if (filterEndDate) params.set('endDate', filterEndDate)

      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (data.success) {
        setLogs(data.data || [])
        setTotal(data.pagination.total)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error('获取操作日志失败:', error)
    } finally {
      setLoading(false)
    }
  }, [page, filterModule, filterAction, filterUserId, filterStartDate, filterEndDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // 筛选重置
  const handleReset = () => {
    setFilterModule('')
    setFilterAction('')
    if (filterUserId) setFilterUserId('')
    setFilterStartDate('')
    setFilterEndDate('')
    setPage(1)
  }

  // 格式化时间
  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  // 截断 JSON 显示
  const truncate = (val: unknown, len = 80) => {
    if (val === null || val === undefined) return '-'
    const str = JSON.stringify(val, null, 0)
    return str.length > len ? str.slice(0, len) + '...' : str
  }

  return (
    <>
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">操作日志</h1>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={filterModule}
            onChange={e => { setFilterModule(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {MODULE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {ACTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={filterStartDate}
            onChange={e => { setFilterStartDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="开始日期"
          />

          <input
            type="date"
            value={filterEndDate}
            onChange={e => { setFilterEndDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="结束日期"
          />

          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            重置筛选
          </button>
        </div>
      </div>

      {/* 统计 */}
      <div className="mb-4 text-sm text-gray-500">
        共 {total} 条记录
      </div>

      {/* 日志列表 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center text-gray-400">
          暂无操作日志
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">时间</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">操作人</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">模块</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">对象ID</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">变更摘要</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">IP</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-gray-900">{log.user.nickname || log.user.phone}</span>
                          <span className="ml-1 text-xs text-gray-400">({log.user.role})</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {MODULE_LABELS[log.module] || log.module}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {log.targetId ? log.targetId.slice(0, 8) + '...' : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {log.newValue ? truncate(log.newValue) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {log.ip || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setDetailLog(log)}
                          className="text-primary hover:text-primary-600 text-xs font-medium"
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-500">
                第 {page} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 详情弹窗 */}
      {detailLog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailLog(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">操作日志详情</h2>
                <button onClick={() => setDetailLog(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">时间：</span>
                  <span className="text-gray-900">{formatTime(detailLog.createdAt)}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">操作人：</span>
                  <span className="text-gray-900">{detailLog.user.nickname || detailLog.user.phone} ({detailLog.user.role})</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">模块：</span>
                  <span className="text-gray-900">{MODULE_LABELS[detailLog.module] || detailLog.module}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">操作：</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[detailLog.action] || ''}`}>
                    {detailLog.action}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">对象ID：</span>
                  <span className="text-gray-900 font-mono text-xs">{detailLog.targetId || '-'}</span>
                </div>
                {detailLog.ip && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20 shrink-0">IP：</span>
                    <span className="text-gray-900">{detailLog.ip}</span>
                  </div>
                )}
                {detailLog.userAgent && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-20 shrink-0">UA：</span>
                    <span className="text-gray-900 text-xs break-all">{detailLog.userAgent}</span>
                  </div>
                )}
                {detailLog.oldValue && (
                  <div>
                    <span className="text-gray-500">变更前：</span>
                    <pre className="mt-1 bg-red-50 border border-red-100 rounded-lg p-3 text-xs overflow-x-auto">
                      {JSON.stringify(detailLog.oldValue, null, 2)}
                    </pre>
                  </div>
                )}
                {detailLog.newValue && (
                  <div>
                    <span className="text-gray-500">变更后：</span>
                    <pre className="mt-1 bg-green-50 border border-green-100 rounded-lg p-3 text-xs overflow-x-auto">
                      {JSON.stringify(detailLog.newValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}