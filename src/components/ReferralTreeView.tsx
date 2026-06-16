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
  phoneFull?: string   // v28: 完整手机号
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

// v31 自适应宽度工具函数（铁律 11：3 处必须用同一个 getNodeSize）

/** 估算单个字符的渲染宽度 */
function estimateCharWidth(ch: string, fontSize: number): number {
  if (/[\u4e00-\u9fa5]/.test(ch)) return fontSize        // 中文 = fontSize
  else if (/[0-9]/.test(ch)) return fontSize * 0.6   // 数字
  else if (/[a-zA-Z]/.test(ch)) return fontSize * 0.55 // 英文
  else return fontSize * 0.5                              // 其他符号
}

/** 估算整段文本的渲染宽度 */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) w += estimateCharWidth(ch, fontSize)
  return w
}

const NODE_PADDING_X = 10   // 左右内边距
const MIN_NODE_WIDTH = 80    // 最小宽度防止太窄

/** 根据节点数据动态计算尺寸（铁律 11：唯一尺寸来源） */
function getNodeSize(data: ReferralNodeData): { width: number; height: number } {
  const levelName = LEVEL_NAMES[data.level] || `Lv${data.level}`

  // 各行字体大小
  const fsPhone = 10
  const fsName = data.isRoot ? 14 : (data.depth <= 1 ? 13 : 11)
  const fsBadge = data.isRoot ? 10 : 9

  // 三行内容宽度估算
  const line1 = 10 + estimateTextWidth(data.phoneFull || '', fsPhone)              // ● + 手机号
  const line2 = estimateTextWidth(data.nickname || '-', fsName)                     // 昵称
  const line3 = estimateTextWidth(`${levelName} ⬇${data.childCount} ${data.salesAmount}`, fsBadge) + 14  // 等级 + 直推 + 业绩

  const contentWidth = Math.max(line1, line2, line3)
  const width = Math.max(contentWidth + NODE_PADDING_X * 2, MIN_NODE_WIDTH)
  const height = data.isRoot ? 64 : (data.depth <= 1 ? 54 : 46)

  return { width, height }
}

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

  // v32：root 节点（自己）特殊标识
  const isSelf = data.isRoot

  // v31：自适应宽度（铁律 11：唯一尺寸来源 = getNodeSize）
  const { width, height } = getNodeSize(data)
  const fontSizeName = isSelf ? 13 : data.depth <= 1 ? 11 : 10
  const fontSizeBadge = isSelf ? 10 : 9

  // v32：root 节点金色样式
  const selfStyle = isSelf ? {
    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    border: '3px solid #f59e0b',
    boxShadow: '0 6px 16px rgba(245, 158, 11, 0.25)',
  } : {
    background: '#ffffff',
    border: `1.5px solid ${p.color}`,
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
  }

  return (
    <div
      style={{
        width,
        height,
        padding: '5px 8px',
        borderRadius: 8,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        ...selfStyle,
      }}
      onMouseEnter={(e) => { if (!isSelf) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={(e) => { if (!isSelf) (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: isSelf ? '#f59e0b' : p.color, border: 'none', width: 5, height: 5 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: isSelf ? '#f59e0b' : p.color, border: 'none', width: 5, height: 5 }} />

      {/* v32：root 节点 👑 自己 徽章 */}
      {isSelf && (
        <div style={{
          position: 'absolute',
          top: -11,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#fff',
          borderRadius: 10,
          padding: '2px 8px',
          fontSize: 9,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 6px rgba(245, 158, 11, 0.35)',
          zIndex: 10,
        }}>👑 自己</div>
      )}

      {/* 第1行：完整手机号（v28） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 8, color: isSelf ? '#d97706' : p.color }}>●</span>
        <span style={{ fontSize: 10, color: isSelf ? '#92400e' : '#4b5563', fontWeight: isSelf ? 600 : 400 }}>{data.phoneFull || data.phoneTail}</span>
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
    // v30：进一步紧凑间距
    nodesep: 16,
    ranksep: 36,
    marginx: 8,
    marginy: 8,
  })

  for (const node of nodes) {
    // v31：统一用 getNodeSize（铁律 11）
    const { width: w, height: h } = getNodeSize(node.data!)
    dagreGraph.setNode(node.id, { width: w, height: h })
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target)
  }

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const nwp = dagreGraph.node(node.id)
    // v31：统一用 getNodeSize（铁律 11）
    const { width: w, height: h } = getNodeSize(node.data!)
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
    label: treeNode.nickname || treeNode.phone,
    phoneTail: treeNode.phone.slice(-4),
    phoneFull: treeNode.phone,  // v28: 完整手机号
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
