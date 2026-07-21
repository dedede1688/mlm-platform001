'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Wallet, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

interface TodaySummary {
  totalAmount: number
  distributedUsers: number
  eligibleUsers: number
  isSettled: boolean
  isSnapshotted: boolean
  settledCount: number
  unsettledCount: number
}

export default function AdminDividendsPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [summary, setSummary] = useState<TodaySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [settleLoading, setSettleLoading] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('adminToken')
    if (!storedToken) {
      router.push('/admin/login')
      return
    }
    setToken(storedToken)
    fetchSummary(storedToken)
  }, [router])

  const fetchSummary = async (authToken: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settle-dividends', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setSummary(data.data)
      }
    } catch (err) {
      console.error('获取分红摘要失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action: 'snapshot' | 'settle') => {
    if (!token) return
    if (action === 'settle') {
      if (!confirm('确认执行周结？此操作将把本周所有未结算分红统一入账。')) return
      setSettleLoading(true)
    } else {
      setSnapshotLoading(true)
    }
    try {
      const res = await fetch('/api/admin/settle-dividends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        if (action === 'snapshot') {
          toast.success('日快照执行成功')
        } else {
          toast.success(`周结入账成功：¥${data.data?.totalAmount?.toFixed(2) ?? '0.00'}`)
        }
        await fetchSummary(token)
      } else {
        toast.error(data.error || `操作失败（${res.status}）`)
      }
    } catch (_err) {
      toast.error('请求失败')
    } finally {
      setSnapshotLoading(false)
      setSettleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            分红结算
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* 状态摘要卡片 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">今日分红状态</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">今日总金额</p>
                <p className="text-lg font-bold text-green-700">¥{summary.totalAmount?.toFixed(2) ?? '0.00'}</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">已生成条数</p>
                <p className="text-lg font-bold text-blue-700">{summary.distributedUsers ?? 0}</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">未结算条数</p>
                <p className="text-lg font-bold text-amber-700">{summary.unsettledCount ?? 0}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">已结算条数</p>
                <p className="text-lg font-bold text-purple-700">{summary.settledCount ?? 0}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">暂无数据</p>
          )}
        </div>

        {/* 操作区 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">手动操作</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-blue-200 rounded-lg p-5 bg-blue-50/40">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">日快照</h3>
              </div>
              <p className="text-xs text-gray-600 mb-4">
                生成今日分红明细（仅记录，不入账）。通常由 Vercel Cron 每日 0:00 自动执行。
              </p>
              <button
                onClick={() => handleAction('snapshot')}
                disabled={snapshotLoading}
                className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {snapshotLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    执行中
                  </span>
                ) : (
                  '执行日快照'
                )}
              </button>
            </div>

            <div className="border border-amber-200 rounded-lg p-5 bg-amber-50/40">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-gray-900">周结入账</h3>
              </div>
              <p className="text-xs text-gray-600 mb-4">
                把本周所有未结算分红统一入账（幂等，重复执行不会重复入账）。通常由 Vercel Cron 周一 0:00 自动执行。
              </p>
              <button
                onClick={() => handleAction('settle')}
                disabled={settleLoading}
                className="w-full py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {settleLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    入账中
                  </span>
                ) : (
                  '执行周结'
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center">
          提示：分红规则详见 PRD §2.4.3（每日快照 + 周日统一发放）
        </p>
      </main>
    </div>
  )
}
