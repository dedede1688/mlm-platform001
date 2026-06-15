'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Network, Loader2, ChevronLeft, Users, RefreshCw,
  ZoomIn, ZoomOut, Maximize,
  TrendingUp, ShoppingCart, Calendar, X
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'

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

// ---- 常量：8 级等级配色（主色 + 渐变浅色 + 深色边框） ----

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_PALETTE: Record<number, { color: string; bg: string; border: string }> = {
  0: { color: '#9ca3af', bg: '#f3f4f6', border: '#9ca3af' },
  1: { color: '#3b82f6', bg: '#eff6ff', border: '#60a5fa' },
  2: { color: '#22c55e', bg: '#f0fdf4', border: '#4ade80' },
  3: { color: '#eab308', bg: '#fefce8', border: '#facc15' },
  4: { color: '#f97316', bg: '#fff7ed', border: '#fb923c' },
  5: { color: '#a855f7', bg: '#faf5ff', border: '#c084fc' },
  6: { color: '#ef4444', bg: '#fef2f2', border: '#f87171' },
  7: { color: '#d97706', bg: '#fffbeb', border: '#f59e0b' },
}

function formatCurrency(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- 节点短 ID（取后 4 位） ----

function shortId(phone: string): string {
  return phone.slice(-4)
}

// ---- 转换为 ECharts 树数据（浮窗卡片 v23） ----

function toEChartsTree(node: TreeNode): Record<string, unknown> {
  const p = LEVEL_PALETTE[node.level] || LEVEL_PALETTE[0]
  const name = node.nickname || '-'
  const levelName = LEVEL_NAMES[node.level] || `Lv${node.level}`
  const childCount = node.children.length
  const sales = formatCurrency(node.directSalesAmount)

  // rich 文本标签：三段式布局
  // 第1行：彩色圆点 + 短ID（小字）
  // 第2行：昵称（粗体大字）
  // 第3行：等级徽章 · 直推数 · 业绩
  const labelStr =
    `{dot|●}{sid|${shortId(node.phone)}}\n` +
    `{name|${name}}\n` +
    `{badge|${levelName} · ⬇${childCount} · ${sales}}`

  return {
    name: labelStr,
    value: node.level,
    data: {
      id: node.id,
      phone: node.phone,
      nickname: node.nickname,
      level: node.level,
      directSalesAmount: node.directSalesAmount,
      orderCount: node.orderCount,
      teamCount: node.teamCount,
      createdAt: node.createdAt,
      childCount: node.children.length,
    },
    symbol: 'roundRect',
    symbolSize: [180, 80],           // ✅ v24 紧凑卡片尺寸
    itemStyle: {
      color: '#ffffff',              // ✅ 白底
      borderColor: p.color,         // ✅ 等级色描边
      borderWidth: 2,
      borderRadius: 16,              // ✅ 圆角 16px
      shadowColor: 'rgba(0,0,0,0.08)', // ✅ 轻阴影
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
    },
    label: {
      show: true,
      position: 'inside',
      verticalAlign: 'middle',
      align: 'center',
      formatter: (params: { name: string }) => params.name,
      rich: {
        dot: {
          fontSize: 9,
          color: p.color,
          lineHeight: 16,
          width: 12,
        },
        sid: {
          fontSize: 10,
          color: '#9ca3af',
          lineHeight: 16,
        },
        name: {
          fontSize: 13,
          fontWeight: 'bold',
          color: '#111827',
          lineHeight: 20,
          width: 160,
          overflow: 'truncate',
        },
        badge: {
          fontSize: 9,
          color: '#6b7280',
          lineHeight: 16,
        },
      },
    },
    emphasis: {
      itemStyle: {
        shadowColor: `${p.color}40`,     // ✅ 悬停等级色阴影
        shadowBlur: 16,
        shadowOffsetY: 4,
        borderColor: p.color,
        borderWidth: 2.5,
      },
      scale: true,
      scaleSize: 4,
    },
    children: node.children.map(c => toEChartsTree(c)),
  }
}

// ---- 统计节点 ----

function countNodes(node: TreeNode | null): number {
  if (!node) return 0
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}

// ---- Tooltip 格式化器 ----

function buildTooltipHtml(d: {
  id: string; phone: string; nickname: string | null; level: number
  directSalesAmount: number; orderCount: number; teamCount: number
  createdAt: string; childCount: number
}, depth: number): string {
  const lv = d.level
  const name = (d.nickname || d.phone).replace(/\n/g, ' ')
  const rows = [
    ['等级', LEVEL_NAMES[lv] || String(lv)],
    ['层级', `第 ${depth} 层`],
    ['累计业绩', formatCurrency(d.directSalesAmount)],
    ['订单数', String(d.orderCount)],
    ['团队人数', String(d.teamCount)],
    ['注册时间', formatDate(d.createdAt)],
  ]
  const body = rows.map(([label, value]) =>
    `<div style="display:flex;justify-content:space-between"><span style="color:#6b7280">${label}</span><span style="font-weight:500">${value}</span></div>`
  ).join('')
  return `<div style="font-size:13px;line-height:1.7;min-width:220px">
    <div style="font-weight:600;font-size:14px;margin-bottom:4px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${name}</div>
    ${body}
    <div style="margin-top:4px;padding-top:4px;border-top:1px dashed #e5e7eb;text-align:center;color:#9ca3af;font-size:11px">点击查看详情</div>
  </div>`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 头部 - 等级渐变色 */}
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

// ---- 主组件 ----

export default function ReferralTreePage() {
  const params = useParams()
  const userId = params.id as string

  const [token, setToken] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [summary, setSummary] = useState<TreeSummary | null>(null)
  const [maxLevel, setMaxLevel] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [detailNode, setDetailNode] = useState<TreeNode | null>(null)
  const chartRef = useRef<ReactECharts>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) setToken(storedToken)
  }, [])

  // 加载树数据
  useEffect(() => {
    if (!token || !userId) return
    setLoading(true)
    setError('')
    setTree(null)
    setSummary(null)
    setDetailNode(null)

    const loadTree = async () => {
      try {
        const res = await fetch(`/api/admin/referral-tree/${userId}?maxLevel=${maxLevel}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data: ApiResponse = await res.json()
        if (data.success) {
          setTree(data.data)
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

  // 缩放控制
  const handleZoom = (delta: number) => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const option = chart.getOption() as { series: { zoom: number }[] }
    const currentZoom = option?.series?.[0]?.zoom ?? 1
    chart.setOption({ series: [{ zoom: currentZoom + delta }] })
  }

  const handleReset = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    chart.setOption({ series: [{ zoom: 1, center: undefined }] })
  }

  // ---- ECharts 配置（v23 终极版：浮窗卡片 + TB 思维导图） ----

  const chartOption = useMemo(() => {
    if (!tree) return {}
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: '#374151' },
        extraCssText: 'box-shadow: 0 6px 20px rgba(0,0,0,0.12); border-radius: 10px;',
        formatter: (params: { data: Record<string, unknown>; treeAncestors?: unknown[] }) => {
          const d = params.data as unknown as {
            id: string; phone: string; nickname: string | null; level: number
            directSalesAmount: number; orderCount: number; teamCount: number
            createdAt: string; childCount: number
          } | undefined
          if (!d?.id) return ''
          const depth = params.treeAncestors?.length ?? 1
          return buildTooltipHtml(d, depth)
        },
      },
      series: [
        {
          type: 'tree',
          data: [toEChartsTree(tree)],
          top: '2%',
          bottom: '2%',
          left: '15%',
          right: '15%',
          orient: 'TB',                    // ✅ 竖向 top → bottom
          layout: 'orthogonal',
          edgeShape: 'polyline',          // ✅ 折线（思维导图风格）
          edgeForkPosition: '50%',         // 分叉位置居中
          nodeGap: 12,                     // ✅ v24 更紧凑间距
          initialTreeDepth: -1,           // ✅ 全部展开
          expandAndCollapse: true,
          animationDuration: 400,
          animationDurationUpdate: 500,
          lineStyle: {
            color: '#cbd5e1',            // ✅ 淡灰细线
            width: 1.5,                    // ✅ 细线
            curveness: 0,                  // ✅ 直角折线
          },
          emphasis: {
            focus: 'descendant',
          },
          blur: {
            itemStyle: { opacity: 0.35 },
            lineStyle: { opacity: 0.12 },
          },
          label: {
            position: 'inside',
            verticalAlign: 'middle',
            align: 'center',
          },
          leaves: {
            label: { position: 'inside' },
          },
        },
      ],
    }
  }, [tree])

  // 点击事件
  const handleChartClick = (params: { data?: Record<string, unknown> }) => {
    const d = params.data as unknown as { id: string } | undefined
    if (d?.id) {
      const found = findNodeById(tree, d.id)
      if (found) setDetailNode(found)
    }
  }

  function findNodeById(node: TreeNode | null, id: string): TreeNode | null {
    if (!node) return null
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findNodeById(child, id)
      if (found) return found
    }
    return null
  }

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
            setTree(data.data)
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
                <Maximize className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500">最深层级</span>
              </div>
              <p className="text-xl font-bold text-purple-600">第 {summary.maxLevelReached} 层</p>
            </div>
          </div>
        </div>
      )}

      {/* 状态栏 + 缩放 */}
      {tree && (
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-700">共 {nodeCount} 人，{maxLevel} 层</span>
            {truncated && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">节点过多，仅显示部分</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleZoom(0.2)} className="p-1.5 rounded border border-gray-300 hover:bg-gray-50" title="放大"><ZoomIn className="w-4 h-4 text-gray-600" /></button>
            <button onClick={() => handleZoom(-0.2)} className="p-1.5 rounded border border-gray-300 hover:bg-gray-50" title="缩小"><ZoomOut className="w-4 h-4 text-gray-600" /></button>
            <button onClick={handleReset} className="p-1.5 rounded border border-gray-300 hover:bg-gray-50" title="重置视图"><Maximize className="w-4 h-4 text-gray-600" /></button>
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
          <span className="ml-2 text-gray-400">| 💡 单击查看详情 · 思维导图</span>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-500">加载推荐树...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 text-red-500">
            <Network className="w-12 h-12 mb-3 opacity-50" />
            <p>{error}</p>
          </div>
        ) : tree ? (
          <ReactECharts
            ref={chartRef}
            option={chartOption}
            style={{ height: '800px', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            onEvents={{ click: handleChartClick }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
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
