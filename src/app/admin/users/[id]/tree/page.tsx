'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Network, Loader2, ChevronLeft, Users, RefreshCw,
  TrendingUp, ShoppingCart, Calendar, X
} from 'lucide-react'

// 使用公共组件（v27 抽取）
import ReferralTreeView, {
  TreeNode,
  TreeSummary,
  LEVEL_NAMES,
  LEVEL_PALETTE,
  formatCurrency,
  formatDate,
} from '@/components/ReferralTreeView'

// ---- 类型 ----

// v32：父链节点类型
interface AncestorNode {
  id: string
  nickname: string | null
  phone: string
}

interface ApiResponse {
  success: boolean
  data: TreeNode | null
  error?: string
  truncated?: boolean
  nodeCount?: number
  summary?: TreeSummary
  ancestors?: AncestorNode[]   // v32：父链
  rootParentId?: string | null   // v32：root 的直接父节点 ID
}

// ---- 节点详情弹窗 ----

function NodeDetailModal({
  node,
  onClose,
}: {
  node: NonNullable<ApiResponse['data']>
  onClose: () => void
}) {
  if (!node) return null
  const p = LEVEL_PALETTE[node.level] || LEVEL_PALETTE[0]

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 text-white" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` }}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold">{node.nickname || node.phone}</h3>
              <p className="text-white/80 text-sm mt-0.5">{node.phone}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/20">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#fff' }} />
            {LEVEL_NAMES[node.level] || `Lv${node.level}`}
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
            <div className="p-2 bg-green-500 rounded-lg"><TrendingUp className="w-5 h-5 text-white" /></div>
            <div><p className="text-xs text-green-600">累计业绩</p><p className="text-lg font-bold text-green-800">{formatCurrency(node.directSalesAmount)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1"><ShoppingCart className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500">订单数</span></div>
              <p className="text-base font-bold text-gray-900">{node.orderCount}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1"><Users className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500">团队人数</span></div>
              <p className="text-base font-bold text-gray-900">{node.teamCount}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1"><Calendar className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500">注册时间</span></div>
              <p className="text-sm font-medium text-gray-900">{formatDate(node.createdAt)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1"><Network className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500">直接下级</span></div>
              <p className="text-base font-bold text-gray-900">{node.children?.length ?? 0}</p>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100 flex justify-between text-sm text-gray-500">
            <span>总积分</span><span className="font-medium text-gray-700">{node.totalPoints.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 主组件 — 全屏页面视图（复用 ReferralTreeView）
// ============================================================

export default function ReferralTreePage() {
  const params = useParams()
  const router = useRouter()    // v32：用于节点点击跳转
  const userId = params.id as string

  const [token, setToken] = useState<string | null>(null)
  const [rawTree, setRawTree] = useState<TreeNode | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [summary, setSummary] = useState<TreeSummary | null>(null)
  const [maxLevel, setMaxLevel] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailNode, setDetailNode] = useState<TreeNode | null>(null)
  const [ancestors, setAncestors] = useState<AncestorNode[]>([])   // v32
  const [rootParentId, setRootParentId] = useState<string | null>(null) // v32

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t) setToken(t)
  }, [])

  // 加载数据
  useEffect(() => {
    if (!token || !userId) return
    setLoading(true)
    setError('')
    setRawTree(null)

    fetch(`/api/admin/referral-tree/${userId}?maxLevel=${maxLevel}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((data: ApiResponse) => {
        if (data.success) {
          setRawTree(data.data)
          setTruncated(data.truncated || false)
          setNodeCount(data.nodeCount ?? 0)
          if (data.summary) setSummary(data.summary)
          // v32：保存父链信息
          setAncestors(data.ancestors || [])
          setRootParentId(data.rootParentId ?? null)
        } else {
          setError(data.error || '获取推荐树失败')
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false))
  }, [token, userId, maxLevel])

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
          setRawTree(data.data)
          setTruncated(data.truncated || false)
          setNodeCount(data.nodeCount ?? 0)
          if (data.summary) setSummary(data.summary)
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false))
  }

  return (
    <>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Network className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">推荐关系图</h1>
      </div>

      {/* v32：面包屑导航（父链溯源） */}
      {ancestors.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl shadow-sm p-3 mb-4 flex items-center gap-2 flex-wrap border border-amber-100">
          <span className="text-xs text-gray-500 font-medium">溯源路径：</span>
          {ancestors.map((ancestor, idx) => (
            <span key={ancestor.id} className="flex items-center gap-1.5">
              <Link
                href={`/admin/users/${ancestor.id}/tree`}
                className="px-2 py-0.5 rounded text-xs text-gray-600 hover:bg-amber-100 hover:text-amber-800 transition-colors"
              >
                {ancestor.nickname || ancestor.phone.slice(-4)}
              </Link>
              {idx < ancestors.length - 1 && <span className="text-gray-300">→</span>}
            </span>
          ))}
          <span className="text-gray-300">→</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-300 shadow-sm">
            👑 当前用户
          </span>
        </div>
      )}

      {/* 工具栏 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-4 flex items-center gap-4 flex-wrap">
        <span className="text-sm text-gray-700 font-medium">展示层级：</span>
        <select value={maxLevel} onChange={e => setMaxLevel(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          {[1, 2, 3, 4, 5].map(n => (<option key={n} value={n}>{n} 层</option>))}
        </select>
        <button onClick={handleReload}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
          <RefreshCw className="w-3.5 h-3.5" />刷新
        </button>
      </div>

      {/* 摘要条 */}
      {summary && (
        <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-emerald-50 rounded-xl shadow-lg p-5 mb-4 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">团队概览</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users className="w-4 h-4 text-blue-500" /><span className="text-xs text-gray-500">团队总人数</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{summary.totalTeam}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-500" /><span className="text-xs text-gray-500">团队总业绩</span>
              </div>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.totalSales)}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <ShoppingCart className="w-4 h-4 text-orange-500" /><span className="text-xs text-gray-500">订单总数</span>
              </div>
              <p className="text-xl font-bold text-orange-600">{summary.totalOrders}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Network className="w-4 h-4 text-purple-500" /><span className="text-xs text-gray-500">最深层级</span>
              </div>
              <p className="text-xl font-bold text-purple-600">第 {summary.maxLevelReached} 层</p>
            </div>
          </div>
        </div>
      )}

      {/* 状态栏 */}
      {rawTree && (
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-700">共 {nodeCount} 人，{maxLevel} 层</span>
            {truncated && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">节点过多，仅显示部分</span>
            )}
          </div>
          <div className="text-xs text-gray-400">🖱️ 拖拽移动 · 🔄 滚轮缩放 · 👆 单击查看详情</div>
        </div>
      )}

      {/* 图例 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">等级图例：</span>
          {Object.entries(LEVEL_NAMES).map(([lv, name]) => (
            <span key={lv} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LEVEL_PALETTE[Number(lv)].color }} />
              {name}
            </span>
          ))}
          <span className="ml-2 text-gray-400">| 💡 react-flow + dagre 自动布局（全屏模式）</span>
        </div>
      </div>

      {/* ===== ReactFlow 视图（复用公共组件） ===== */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden" style={{ height: 750 }}>
        <ReferralTreeView
          data={rawTree}
          summary={summary}
          nodeCount={nodeCount}
          truncated={truncated}
          loading={loading}
          error={error}
          compact={false}
          height={750}
          onNodeClick={(node) => {
            // v32：点击节点 → 跳转到该用户的推荐树页面
            router.push(`/admin/users/${node.id}/tree`)
          }}
        />
      </div>

      {/* 返回按钮 */}
      <div className="flex justify-center mt-6">
        <Link href="/admin/users" className="inline-flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
          <ChevronLeft className="w-4 h-4" />返回会员管理
        </Link>
      </div>

      {/* 详情弹窗 */}
      {detailNode && <NodeDetailModal node={detailNode} onClose={() => setDetailNode(null)} />}
    </>
  )
}
