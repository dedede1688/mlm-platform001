'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Network, Users, TrendingUp, ShoppingCart, Loader2, RefreshCw } from 'lucide-react'
import ReferralTreeView, {
  TreeNode,
  TreeSummary,
} from './ReferralTreeView'

// ---- 类型 ----

export interface ReferralTreePanelProps {
  userId: string
  userName?: string
  onClose: () => void
}

// ---- 常量 ----

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_PALETTE: Record<number, { color: string }> = {
  0: { color: '#9ca3af' }, 1: { color: '#3b82f6' }, 2: { color: '#22c55e' },
  3: { color: '#eab308' }, 4: { color: '#f97316' }, 5: { color: '#a855f7' },
  6: { color: '#ef4444' }, 7: { color: '#d97706' },
}

function formatCurrency(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface ApiResponse {
  success: boolean
  data: TreeNode | null
  error?: string
  truncated?: boolean
  nodeCount?: number
  summary?: TreeSummary
}

// ============================================================
// 主组件：浮动面板
// ============================================================

export default function ReferralTreePanel({ userId, userName, onClose }: ReferralTreePanelProps) {
  const [token, setToken] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<TreeNode | null>(null)
  const [summary, setSummary] = useState<TreeSummary | null>(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [maxLevel, setMaxLevel] = useState(3)

  // 获取 token
  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t) setToken(t)
  }, [])

  // 加载数据
  useEffect(() => {
    if (!token || !userId) return
    setLoading(true)
    setError('')
    setTreeData(null)

    fetch(`/api/admin/referral-tree/${userId}?maxLevel=${maxLevel}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: ApiResponse) => {
        if (data.success) {
          setTreeData(data.data)
          setTruncated(data.truncated || false)
          setNodeCount(data.nodeCount ?? 0)
          if (data.summary) setSummary(data.summary)
        } else {
          setError(data.error || '获取推荐树失败')
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false))
  }, [token, userId, maxLevel])

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // 刷新
  const handleReload = () => {
    if (!token || !userId) return
    setLoading(true)
    setError('')
    fetch(`/api/admin/referral-tree/${userId}?maxLevel=${maxLevel}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: ApiResponse) => {
        if (data.success) {
          setTreeData(data.data)
          setTruncated(data.truncated || false)
          setNodeCount(data.nodeCount ?? 0)
          if (data.summary) setSummary(data.summary)
        } else {
          setError(data.error || '获取推荐树失败')
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false))
  }

  // 节点点击 → 暂不处理（可扩展）
  const handleNodeClick = useCallback((_node: TreeNode) => {
    // v27.1 可扩展为节点详情弹窗
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
    >
      {/* 面板卡片 — 点击内部不关闭 */}
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ width: '90vw', maxWidth: 900, height: '85vh', maxHeight: 700, animation: 'slideInRight 0.3s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ===== 标题栏 ===== */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        }}>
          <div className="flex items-center gap-3">
            <Network className="w-5 h-5 text-white/90" />
            <h2 className="text-base font-bold text-white">
              推荐关系图 — {userName || userId.slice(-4)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* 层级选择 */}
            <select
              value={maxLevel}
              onChange={e => setMaxLevel(Number(e.target.value))}
              className="px-2 py-1 rounded-md border-none text-xs bg-white/20 text-white focus:ring-2 focus:ring-white/40"
            >
              {[1, 2, 3, 4, 5].map(n => (<option key={n} value={n} style={{ color: '#111' }}>{n} 层</option>))}
            </select>
            {/* 刷新 */}
            <button onClick={handleReload}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title="刷新">
              <RefreshCw className="w-4 h-4 text-white/90" />
            </button>
            {/* 关闭 */}
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title="关闭 (ESC)">
              <X className="w-4 h-4 text-white/90" />
            </button>
          </div>
        </div>

        {/* ===== 摘要条 ===== */}
        {summary && (
          <div className="px-4 py-2.5 shrink-0 bg-gradient-to-r from-purple-50 via-blue-50 to-emerald-50 border-b border-purple-100">
            <div className="grid grid-cols-4 gap-2">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs text-gray-500">团队</span>
                <span className="text-sm font-bold text-gray-800">{summary.totalTeam}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs text-gray-500">业绩</span>
                <span className="text-sm font-bold text-emerald-600">{formatCurrency(summary.totalSales)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs text-gray-500">订单</span>
                <span className="text-sm font-bold text-orange-600">{summary.totalOrders}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs text-gray-500">层级</span>
                <span className="text-sm font-bold text-purple-600">第{summary.maxLevelReached}</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== 状态栏 ===== */}
        {!loading && !error && treeData && (
          <div className="px-4 py-1.5 shrink-0 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-xs text-gray-500">
              共 {nodeCount} 人 · {maxLevel} 层
              {truncated && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 text-[10px] border border-yellow-200">截断</span>}
            </span>
            <span className="text-[10px] text-gray-400">🖱️ 拖拽 · 🔄 缩放 · ESC 关闭</span>
          </div>
        )}

        {/* ===== 图例 ===== */}
        {!loading && (
          <div className="px-4 py-1 shrink-0 bg-white border-b flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
            {Object.entries(LEVEL_NAMES).map(([lv, name]) => (
              <span key={lv} className="inline-flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LEVEL_PALETTE[Number(lv)].color }} />
                {name}
              </span>
            ))}
          </div>
        )}

        {/* ===== ReactFlow 内容区 ===== */}
        <div className="flex-1 min-h-0">
          <ReferralTreeView
            data={treeData}
            summary={summary}
            nodeCount={nodeCount}
            truncated={truncated}
            loading={loading}
            error={error}
            compact={true}
            height={480}
            onNodeClick={handleNodeClick}
          />
        </div>
      </div>

      {/* 动画样式 */}
      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
