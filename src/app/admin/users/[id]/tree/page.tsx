'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Network, Loader2, ChevronLeft, Users, RefreshCw,
  TrendingUp, ShoppingCart, Calendar, X
} from 'lucide-react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  NodeProps,
  Handle,
  Position,
  ReactFlowProvider,
  ReactFlowInstance,
} from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'

// ---- 类型 ----

interface TreeNode {
  id: string
  phone: string
  nickname: string | null
  level: number
  avatarUrl: string | null
  totalPoints: number
  directSalesAmount: number
  orderCount: number
  teamCount: number
  createdAt: string
  children: TreeNode[]
}

interface TreeSummary {
  totalTeam: number
  totalSales: number
  totalOrders: number
  maxLevelReached: number
}

interface ApiResponse {
  success: boolean
  data: TreeNode | null
  error?: string
  truncated?: boolean
  nodeCount?: number
  summary?: TreeSummary
}

// 节点数据类型（传给自定义节点）
interface ReferralNodeData {
  label: string
  phoneTail: string
  nickname: string | null
  level: number
  childCount: number
  salesAmount: string
  isRoot: boolean
  depth: number
}

// ---- 常量：8 级等级配色 ----

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_PALETTE: Record<number, { color: string; bg: string }> = {
  0: { color: '#9ca3af', bg: '#f9fafb' },
  1: { color: '#3b82f6', bg: '#eff6ff' },
  2: { color: '#22c55e', bg: '#f0fdf4' },
  3: { color: '#eab308', bg: '#fefce8' },
  4: { color: '#f97316', bg: '#fff7ed' },
  5: { color: '#a855f7', bg: '#faf5ff' },
  6: { color: '#ef4444', bg: '#fef2f2' },
  7: { color: '#d97706', bg: '#fffbeb' },
}

function formatCurrency(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============================================================
// Step 5: 自定义节点组件 — ReferralNode
// ============================================================

function ReferralNode({ data }: NodeProps) {
  const p = LEVEL_PALETTE[data.level] || LEVEL_PALETTE[0]
  const levelName = LEVEL_NAMES[data.level] || `Lv${data.level}`

  // 根节点大，子节点小
  const width = data.isRoot ? 200 : data.depth <= 1 ? 170 : 145
  const height = data.isRoot ? 68 : data.depth <= 1 ? 56 : 48
  const fontSizeName = data.isRoot ? 14 : data.depth <= 1 ? 13 : 11
  const fontSizeBadge = data.isRoot ? 10 : 9

  return (
    <div
      className="referral-node"
      style={{
        width,
        height,
        padding: '6px 10px',
        background: '#ffffff',
        border: `1.5px solid ${p.color}`,
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {/* 上方连接点 */}
      <Handle type="target" position={Position.Top}
        style={{ background: p.color, border: 'none', width: 6, height: 6 }} />
      {/* 下方连接点 */}
      <Handle type="source" position={Position.Bottom}
        style={{ background: p.color, border: 'none', width: 6, height: 6 }} />

      {/* 第1行：彩色圆点 + 短ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, color: p.color }}>●</span>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{data.phoneTail}</span>
      </div>

      {/* 第2行：昵称 */}
      <div style={{
        fontSize: fontSizeName,
        fontWeight: 700,
        color: '#111827',
        lineHeight: 1.3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {data.nickname || '-'}
      </div>

      {/* 第3行：等级徽章 + 直推 + 业绩 */}
      <div style={{
        fontSize: fontSizeBadge,
        color: '#6b7280',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span style={{
          display: 'inline-block',
          padding: '0 5px',
          borderRadius: 4,
          background: `${p.color}15`,
          color: p.color,
          fontWeight: 500,
        }}>{levelName}</span>
        <span>⬇{data.childCount}</span>
        <span>{data.salesAmount}</span>
      </div>

      {/* 悬停效果用 CSS hover 处理 */}
    </div>
  )
}

// 注册节点类型
const nodeTypes = { referral: ReferralNode }

// ============================================================
// Step 4: dagre 自动布局算法
// ============================================================

const dagreGraph = new dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

const NODE_WIDTH_BASE = 160   // 默认节点宽度
const NODE_HEIGHT_BASE = 60   // 默认节点高度

function getLayoutedElements(
  nodes: Node<ReferralNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node<ReferralNodeData>[]; edges: Edge[] } {
  const isHorizontal = direction === 'LR'
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 35,     // 同层水平间距
    ranksep: 55,     // 父子垂直间距
    marginx: 20,
    marginy: 20,
  })

  // 先注册所有节点到 dagre
  for (const node of nodes) {
    const w = node.data?.isRoot ? 200 : node.data?.depth && node.data.depth > 1 ? 140 : 165
    const h = node.data?.isRoot ? 70 : node.data?.depth && node.data.depth > 1 ? 50 : 58
    dagreGraph.setNode(node.id, { width: w, height: h })
  }

  // 注册边
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target)
  }

  // 执行布局
  dagre.layout(dagreGraph)

  // 取回布局后的位置
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - (node.data?.isRoot ? 200 : node.data?.depth && node.data.depth > 1 ? 140 : 165) / 2,
        y: nodeWithPosition.y - (node.data?.isRoot ? 70 : node.data?.depth && node.data.depth > 1 ? 50 : 58) / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ============================================================
// 数据转换：TreeNode → react-flow Nodes + Edges
// ============================================================

let globalDepthCounter = 0

function treeToNodesAndEdges(
  treeNode: TreeNode,
  depth: number = 0,
  parentId?: string
): { nodes: Node<ReferralNodeData>[]; edges: Edge[] } {
  const phoneTail = treeNode.phone.slice(-4)
  const levelName = LEVEL_NAMES[treeNode.level] || `Lv${treeNode.level}`
  const salesAmount = formatCurrency(treeNode.directSalesAmount)

  const nodeData: ReferralNodeData = {
    label: treeNode.nickname || phoneTail,
    phoneTail,
    nickname: treeNode.nickname,
    level: treeNode.level,
    childCount: treeNode.children.length,
    salesAmount,
    isRoot: depth === 0,
    depth,
  }

  const node: Node<ReferralNodeData> = {
    id: treeNode.id,
    type: 'referral',
    data: nodeData,
    position: { x: 0, y: 0 }, // dagre 会覆盖
  }

  const nodes: Node<ReferralNodeData>[] = [node]
  const edges: Edge[] = []

  if (parentId) {
    edges.push({
      id: `edge-${parentId}-${treeNode.id}`,
      source: parentId,
      target: treeNode.id,
      type: 'smoothstep',
      style: {
        stroke: '#cbd5e1',
        strokeWidth: 1.5,
      },
      animated: false,
    })
  }

  // 递归处理子节点
  for (const child of treeNode.children) {
    const result = treeToNodesAndEdges(child, depth + 1, treeNode.id)
    nodes.push(...result.nodes)
    edges.push(...result.edges)
  }

  return { nodes, edges }
}

// ============================================================
// 统计辅助函数
// ============================================================

function countNodes(node: TreeNode | null): number {
  if (!node) return 0
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}

// ============================================================
// 节点详情弹窗（保留 v18）
// ============================================================

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
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

        {/* 业务数据 */}
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
// 主页面组件（在 ReactFlowProvider 内部）
// ============================================================

function TreePageInner() {
  const params = useParams()
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

  // react-flow 状态
  const [nodes, setNodes, onNodesChange] = useNodesState<ReferralNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const flowRef = useRef<any>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) setToken(storedToken)
  }, [])

  // 加载树数据
  useEffect(() => {
    if (!token || !userId) return
    setLoading(true)
    setError('')
    setRawTree(null)
    setSummary(null)
    setDetailNode(null)
    setNodes([])
    setEdges([])

    const loadTree = async () => {
      try {
        const res = await fetch(`/api/admin/referral-tree/${userId}?maxLevel=${maxLevel}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data: ApiResponse = await res.json()
        if (data.success) {
          setRawTree(data.data)
          setTruncated(data.truncated || false)
          setNodeCount(data.nodeCount || countNodes(data.data))
          if (data.summary) setSummary(data.summary)
        } else {
          setError(data.error || '获取推荐树失败')
        }
      } catch {
        setError('网络错误，请重试')
      } finally {
        setLoading(false)
      }
    }
    loadTree()
  }, [token, userId, maxLevel])

  // 当 rawTree 变化时，转换 + 布局
  useEffect(() => {
    if (!rawTree) return
    globalDepthCounter = 0
    const { nodes: rawNodes, edges: rawEdges } = treeToNodesAndEdges(rawTree)
    const layouted = getLayoutedElements(rawNodes, rawEdges, 'TB')
    setNodes(layouted.nodes)
    setEdges(layouted.edges)

    // fitView 延迟执行（等 DOM 渲染完）
    setTimeout(() => {
      flowRef.current?.fitView({ padding: 0.15, includeHiddenNodes: true })
    }, 100)
  }, [rawTree]) // eslint-disable-line react-hooks/exhaustive-deps

  // 刷新按钮
  const handleReload = () => {
    if (token && userId) {
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
            setNodeCount(data.nodeCount || countNodes(data.data))
            if (data.summary) setSummary(data.summary)
          } else {
            setError(data.error || '获取推荐树失败')
          }
        })
        .catch(() => setError('网络错误'))
        .finally(() => setLoading(false))
    }
  }

  // 点击节点事件
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (rawTree) {
      const found = findNodeById(rawTree, node.id)
      if (found) setDetailNode(found)
    }
  }, [rawTree])

  function findNodeById(node: TreeNode | null, id: string): TreeNode | null {
    if (!node) return null
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findNodeById(child, id)
      if (found) return found
    }
    return null
  }

  // ---- 渲染 ----
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

      {/* 工具栏：层级选择 + 刷新 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-4 flex items-center gap-4 flex-wrap">
        <span className="text-sm text-gray-700 font-medium">展示层级：</span>
        <select
          value={maxLevel}
          onChange={e => setMaxLevel(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          {[1, 2, 3, 4, 5].map(n => (<option key={n} value={n}>{n} 层</option>))}
        </select>
        <button onClick={handleReload}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />刷新
        </button>
      </div>

      {/* ===== 顶部摘要条（4列数据卡） ===== */}
      {summary && (
        <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-emerald-50 rounded-xl shadow-lg p-5 mb-4 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">团队概览</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500">团队总人数</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{summary.totalTeam}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-gray-500">团队总业绩</span>
              </div>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(summary.totalSales)}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <ShoppingCart className="w-4 h-4 text-orange-500" />
                <span className="text-xs text-gray-500">订单总数</span>
              </div>
              <p className="text-xl font-bold text-orange-600">{summary.totalOrders}</p>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-lg p-3 text-center border border-white shadow-sm">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Network className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500">最深层级</span>
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
          <div className="text-xs text-gray-400">
            🖱️ 拖拽移动 · 🔄 滚轮缩放 · 👆 单击查看详情
          </div>
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
          <span className="ml-2 text-gray-400">| 💡 react-flow + dagre 自动布局</span>
        </div>
      </div>

      {/* ===== ReactFlow 图表区域 ===== */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden" style={{ height: 700 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-500">加载推荐树...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500">
            <Network className="w-12 h-12 mb-3 opacity-50" />
            <p>{error}</p>
          </div>
        ) : nodes.length > 0 ? (
          <ReactFlow
            ref={flowRef}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.25}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            {/* 背景：点状网格 */}
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />

            {/* 控件：缩放 + 适配 */}
            <Controls showInteractive={false} />

            {/* 迷你地图 */}
            <MiniMap
              nodeColor={(node) => {
                const lvl = (node.data as ReferralNodeData)?.level ?? 0
                return LEVEL_PALETTE[lvl]?.color ?? '#9ca3af'
              }}
              maskColor="rgba(0,0,0,0.08)"
              style={{ width: 120, height: 80 }}
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Network className="w-12 h-12 mb-3" />
            <p>暂无推荐数据</p>
          </div>
        )}
      </div>

      {/* 返回按钮 */}
      <div className="flex justify-center mt-6">
        <Link href="/admin/users" className="inline-flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
          <ChevronLeft className="w-4 h-4" />返回会员管理
        </Link>
      </div>

      {/* 节点详情弹窗 */}
      {detailNode && <NodeDetailModal node={detailNode} onClose={() => setDetailNode(null)} />}
    </>
  )
}

// ============================================================
// 导出：包裹 ReactFlowProvider
// ============================================================

export default function ReferralTreePage() {
  return (
    <ReactFlowProvider>
      <TreePageInner />
    </ReactFlowProvider>
  )
}
