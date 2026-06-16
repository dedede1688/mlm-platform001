'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Network, Loader2,
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
} from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'

// ---- 类型 ----

export interface TreeNode {
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

export interface TreeSummary {
  totalTeam: number
  totalSales: number
  totalOrders: number
  maxLevelReached: number
}

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

export interface ReferralTreeViewProps {
  data: TreeNode | null
  summary?: TreeSummary | null
  nodeCount?: number
  truncated?: boolean
  loading?: boolean
  error?: string
  compact?: boolean          // 紧凑模式（浮动面板用）
  height?: number           // 图表高度，默认 600
  onNodeClick?: (node: TreeNode) => void
}

// ---- 常量 ----

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
// 自定义节点组件 — ReferralNode
// ============================================================

function ReferralNode({ data }: NodeProps) {
  const p = LEVEL_PALETTE[data.level] || LEVEL_PALETTE[0]
  const levelName = LEVEL_NAMES[data.level] || `Lv${data.level}`

  const isCompact = (data as any)._compact ?? false
  const width = data.isRoot ? (isCompact ? 170 : 200) : data.depth <= 1 ? (isCompact ? 145 : 170) : (isCompact ? 125 : 145)
  const height = data.isRoot ? (isCompact ? 60 : 68) : data.depth <= 1 ? (isCompact ? 48 : 56) : (isCompact ? 42 : 48)
  const fontSizeName = data.isRoot ? (isCompact ? 13 : 14) : data.depth <= 1 ? (isCompact ? 12 : 13) : (isCompact ? 10 : 11)
  const fontSizeBadge = data.isRoot ? (isCompact ? 9 : 10) : (isCompact ? 8 : 9)

  return (
    <div
      style={{
        width,
        height,
        padding: '4px 8px',
        background: '#ffffff',
        border: `1.5px solid ${p.color}`,
        borderRadius: 8,
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: p.color, border: 'none', width: 5, height: 5 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: p.color, border: 'none', width: 5, height: 5 }} />

      {/* 第1行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 8, color: p.color }}>●</span>
        <span style={{ fontSize: 9, color: '#9ca3af' }}>{data.phoneTail}</span>
      </div>

      {/* 第2行 */}
      <div style={{
        fontSize: fontSizeName,
        fontWeight: 700,
        color: '#111827',
        lineHeight: 1.25,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {data.nickname || '-'}
      </div>

      {/* 第3行 */}
      <div style={{
        fontSize: fontSizeBadge,
        color: '#6b7280',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
      }}>
        <span style={{
          display: 'inline-block',
          padding: '0 4px',
          borderRadius: 3,
          background: `${p.color}15`,
          color: p.color,
          fontWeight: 500,
        }}>{levelName}</span>
        <span>⬇{data.childCount}</span>
        <span>{data.salesAmount}</span>
      </div>
    </div>
  )
}

const nodeTypes = { referral: ReferralNode }

// ============================================================
// dagre 自动布局
// ============================================================

const dagreGraph = new dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

function getLayoutedElements(
  nodes: Node<ReferralNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node<ReferralNodeData>[]; edges: Edge[] } {
  const isHorizontal = direction === 'LR'
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 30,
    ranksep: 50,
    marginx: 15,
    marginy: 15,
  })

  for (const node of nodes) {
    const w = node.data?.isRoot ? 180 : node.data?.depth && node.data.depth > 1 ? 120 : 150
    const h = node.data?.isRoot ? 65 : node.data?.depth && node.data.depth > 1 ? 40 : 52
    dagreGraph.setNode(node.id, { width: w, height: h })
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target)
  }

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const nwp = dagreGraph.node(node.id)
    const w = node.data?.isRoot ? 180 : node.data?.depth && node.data.depth > 1 ? 120 : 150
    const h = node.data?.isRoot ? 65 : node.data?.depth && node.data.depth > 1 ? 40 : 52
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: { x: nwp.x - w / 2, y: nwp.y - h / 2 },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ============================================================
// 数据转换
// ============================================================

function treeToNodesAndEdges(
  treeNode: TreeNode,
  depth: number = 0,
  parentId?: string,
  compact: boolean = false
): { nodes: Node<ReferralNodeData>[]; edges: Edge[] } {
  const nodeData: ReferralNodeData = {
    label: treeNode.nickname || treeNode.phone.slice(-4),
    phoneTail: treeNode.phone.slice(-4),
    nickname: treeNode.nickname,
    level: treeNode.level,
    childCount: treeNode.children.length,
    salesAmount: formatCurrency(treeNode.directSalesAmount),
    isRoot: depth === 0,
    depth,
  }

  // 注入 compact 标记到 data
  ;(nodeData as any)._compact = compact

  const node: Node<ReferralNodeData> = {
    id: treeNode.id,
    type: 'referral',
    data: nodeData,
    position: { x: 0, y: 0 },
  }

  const nodes: Node<ReferralNodeData>[] = [node]
  const edges: Edge[] = []

  if (parentId) {
    edges.push({
      id: `edge-${parentId}-${treeNode.id}`,
      source: parentId,
      target: treeNode.id,
      type: 'smoothstep',
      style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      animated: false,
    })
  }

  for (const child of treeNode.children) {
    const result = treeToNodesAndEdges(child, depth + 1, treeNode.id, compact)
    nodes.push(...result.nodes)
    edges.push(...result.edges)
  }

  return { nodes, edges }
}

function countNodesFn(node: TreeNode | null): number {
  if (!node) return 0
  return 1 + node.children.reduce((sum, c) => sum + countNodesFn(c), 0)
}

// ============================================================
// 内部组件（在 Provider 内）
// ============================================================

function ReferralTreeInner(props: ReferralTreeViewProps) {
  const { data, summary, nodeCount, truncated, loading, error, compact = false, height = 600, onNodeClick } = props

  const [nodes, setNodes, onNodesChange] = useNodesState<ReferralNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const flowRef = useRef<any>(null)

  // 数据变化时重新布局
  useEffect(() => {
    if (!data) { setNodes([]); setEdges([]); return }
    const { nodes: rawNodes, edges: rawEdges } = treeToNodesAndEdges(data, 0, undefined, compact)
    const layouted = getLayoutedElements(rawNodes, rawEdges, 'TB')
    setNodes(layouted.nodes)
    setEdges(layouted.edges)

    setTimeout(() => {
      flowRef.current?.fitView({ padding: 0.12, includeHiddenNodes: true })
    }, 100)
  }, [data, compact])

  // 点击节点
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (data && onNodeClick) {
      const found = findNodeById(data, node.id)
      if (found) onNodeClick(found)
    }
  }, [data, onNodeClick])

  function findNodeById(node: TreeNode | null, id: string): TreeNode | null {
    if (!node) return null
    if (node.id === id) return node
    for (const child of node.children) {
      const f = findNodeById(child, id)
      if (f) return f
    }
    return null
  }

  const actualHeight = compact ? Math.min(height, 500) : height

  return (
    <div className="referral-tree-view" style={{ width: '100%', height: actualHeight }}>
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-500 text-sm">加载中...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-full text-red-500">
          <Network className="w-10 h-10 mb-2 opacity-50" />
          <p className="text-sm">{error}</p>
        </div>
      ) : nodes.length > 0 ? (
        <ReactFlow
          ref={flowRef}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={14} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} />
          {!compact && (
            <MiniMap
              nodeColor={(n) => {
                const lvl = (n.data as ReferralNodeData)?.level ?? 0
                return LEVEL_PALETTE[lvl]?.color ?? '#9ca3af'
              }}
              maskColor="rgba(0,0,0,0.06)"
              style={{ width: 100, height: 70 }}
            />
          )}
        </ReactFlow>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <Network className="w-10 h-10 mb-2" />
          <p className="text-sm">暂无推荐数据</p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 导出：包裹 Provider
// ============================================================

export default function ReferralTreeView(props: ReferralTreeViewProps) {
  return (
    <ReactFlowProvider>
      <ReferralTreeInner {...props} />
    </ReactFlowProvider>
  )

  // 导出常量供外部使用
}

// 导出工具函数和常量
export { LEVEL_NAMES, LEVEL_PALETTE, formatCurrency, formatDate, countNodesFn as countNodes }
