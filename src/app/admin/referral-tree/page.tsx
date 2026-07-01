'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Network, Search, Loader2, ChevronLeft, Users, RefreshCw,
  ZoomIn, ZoomOut, Maximize, ChevronRight,
  TrendingUp, ShoppingCart, Calendar, X, Download, GitBranch
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

interface UserSearchItem {
  id: string
  phone: string
  nickname: string | null
  level: number
}

interface ApiResponse {
  success: boolean
  data: TreeNode | null
  error?: string
  truncated?: boolean
  nodeCount?: number
  summary?: TreeSummary
  // v63 P2-C: 祖先链 + focus 信息
  ancestors?: Array<{ id: string; nickname: string | null; phone: string }>
  focusUserId?: string
}

// ---- 常量 ----

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#3b82f6', 2: '#22c55e', 3: '#eab308',
  4: '#f97316', 5: '#a855f7', 6: '#ef4444', 7: '#d97706',
}

function formatCurrency(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- 转换为 ECharts 树数据 ----

function toEChartsTree(node: TreeNode): Record<string, unknown> {
  const color = LEVEL_COLORS[node.level] || '#6b7280'
  const name = node.nickname
    ? `${node.nickname}\n${node.phone}`
    : node.phone

  return {
    name,
    value: node.level,
    // 携带业务数据供 tooltip 使用
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
    itemStyle: { borderColor: color, color: '#fff', borderWidth: 2 },
    label: {
      color,
      fontSize: 12,
      fontWeight: 500,
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
  return `<div style="font-size:13px;line-height:1.7;min-width:200px">
    <div style="font-weight:600;font-size:14px;margin-bottom:4px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${name}</div>
    ${body}
    <div style="margin-top:4px;padding-top:4px;border-top:1px dashed #e5e7eb;text-align:center;color:#9ca3af;font-size:11px">点击查看详情 / 双击折叠展开</div>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold">
                {node.nickname || node.phone}
              </h3>
              <p className="text-purple-100 text-sm mt-0.5">{node.phone}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/20">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: LEVEL_COLORS[node.level] }}
            />
            {LEVEL_NAMES[node.level] || `Lv${node.level}`}
          </div>
        </div>

        {/* 业务数据 */}
        <div className="p-6 space-y-4">
          {/* 累计业绩 */}
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
            <div className="p-2 bg-green-500 rounded-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-green-600">累计业绩</p>
              <p className="text-lg font-bold text-green-800">{formatCurrency(node.directSalesAmount)}</p>
            </div>
          </div>

          {/* 数据网格 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1">
                <ShoppingCart className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">订单数</span>
              </div>
              <p className="text-base font-bold text-gray-900">{node.orderCount}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">团队人数</span>
              </div>
              <p className="text-base font-bold text-gray-900">{node.teamCount}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">注册时间</span>
              </div>
              <p className="text-sm font-medium text-gray-900">{formatDate(node.createdAt)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1">
                <Network className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">直接下级</span>
              </div>
              <p className="text-base font-bold text-gray-900">{node.children?.length ?? 0}</p>
            </div>
          </div>

          {/* 积分 */}
          <div className="pt-2 border-t border-gray-100 flex justify-between text-sm text-gray-500">
            <span>总积分</span>
            <span className="font-medium text-gray-700">{node.totalPoints.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- 主组件 ----

export default function ReferralTreeVisualizationPage() {
  const [token, setToken] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUserLabel, setSelectedUserLabel] = useState('')

  const [tree, setTree] = useState<TreeNode | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [summary, setSummary] = useState<TreeSummary | null>(null)
  const [maxLevel, setMaxLevel] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // v63 P2-C: 祖先链(从顶级到当前用户的父) + 当前显示用户 ID
  const [ancestors, setAncestors] = useState<Array<{ id: string; nickname: string | null; phone: string }>>([])
  const [focusUserId, setFocusUserId] = useState<string | null>(null)

  // 详情弹窗状态
  const [detailNode, setDetailNode] = useState<TreeNode | null>(null)

  const chartRef = useRef<ReactECharts>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) setToken(storedToken)
  }, [])

  // ---- 搜索用户 ----

  const handleSearch = async () => {
    if (!token || !searchKeyword.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchKeyword.trim())}&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setSearchResults(data.data || [])
      }
    } catch {
      console.error('搜索用户失败')
    } finally {
      setSearching(false)
    }
  }

  // ---- 加载树 ----

  const loadTree = async (userId: string, label: string, level?: number) => {
    if (!token) return
    setSelectedUserId(userId)
    setSelectedUserLabel(label)
    setLoading(true)
    setError('')
    setTree(null)
    setTruncated(false)
    setSummary(null)
    setDetailNode(null)

    const lvl = level ?? maxLevel
    try {
      const res = await fetch(`/api/admin/referral-tree/${userId}?maxLevel=${lvl}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data: ApiResponse = await res.json()
      if (data.success) {
        setTree(data.data)
        setTruncated(data.truncated || false)
        setNodeCount(data.nodeCount || countNodes(data.data))
        if (data.summary) setSummary(data.summary)
        // v63 P2-C: 祖先链 + focus 用户
        setAncestors(data.ancestors || [])
        setFocusUserId(data.focusUserId || userId)
      } else {
        setError(data.error || '获取推荐树失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  // ---- 重新加载（maxLevel 变更） ----

  const handleReload = () => {
    if (selectedUserId) {
      loadTree(selectedUserId, selectedUserLabel)
    }
  }

  // ---- 缩放控制 ----

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

  // v63 P2-C: 导出 PNG (用 echarts 的 getDataURL() 直接截屏)
  const handleExportPNG = () => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart) return
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,  // 高清
      backgroundColor: '#ffffff',
    })
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.download = `推荐关系图_${selectedUserLabel.replace(/[\\/:*?"<>|]/g, '_') || 'user'}_${ts}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ---- ECharts 配置 ----

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
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;',
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
          top: '5%',
          left: '12%',
          bottom: '5%',
          right: '20%',
          symbolSize: 10,
          orient: 'LR',
          label: {
            position: 'left',
            verticalAlign: 'middle',
            align: 'right',
            fontSize: 12,
            fontWeight: 500,
          },
          leaves: {
            label: {
              position: 'right',
              verticalAlign: 'middle',
              align: 'left',
            },
          },
          emphasis: {
            focus: 'descendant',
          },
          expandAndCollapse: true,
          animationDuration: 550,
          animationDurationUpdate: 750,
          initialTreeDepth: 2,
          lineStyle: {
            color: '#d1d5db',
            width: 1.5,
            curveness: 0.5,
          },
        },
      ],
    }
  }, [tree])

  // ---- ECharts 点击事件 ----

  const handleChartClick = (params: { data?: Record<string, unknown> }) => {
    const d = params.data as unknown as { id: string } | undefined
    if (d?.id) {
      // 在树中找到完整节点对象
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

      {/* 搜索栏 + 控制 */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          {/* 搜索 */}
          <div className="flex-1 max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-1">搜索用户</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="输入手机号或昵称..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  text-gray-900 placeholder-gray-400"
              />
            </div>
          </div>

          {/* 深度选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">展示层级</label>
            <select
              value={maxLevel}
              onChange={e => setMaxLevel(Number(e.target.value))}
              className="px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n} 层</option>
              ))}
            </select>
          </div>

          {/* 搜索按钮 */}
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
              transition-colors font-medium whitespace-nowrap disabled:opacity-50"
          >
            {searching ? '搜索中...' : '搜索'}
          </button>

          {/* v63 P2-C: 导出 PNG */}
          <button
            onClick={handleExportPNG}
            disabled={!tree || loading}
            title="导出推荐图为 PNG"
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700
              transition-colors font-medium whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            导出 PNG
          </button>
        </div>

        {/* 搜索结果 */}
        {searchResults.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {searchResults.map(u => (
              <button
                key={u.id}
                onClick={() => {
                  const label = u.nickname ? `${u.nickname} (${u.phone})` : u.phone
                  loadTree(u.id, label)
                  setSearchResults([])
                  setSearchKeyword(u.phone)
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors
                  ${selectedUserId === u.id ? 'bg-blue-50' : ''}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: LEVEL_COLORS[u.level] || '#6b7280' }}
                />
                <span className="text-sm text-gray-900 font-medium">{u.phone}</span>
                {u.nickname && <span className="text-sm text-gray-500">({u.nickname})</span>}
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {LEVEL_NAMES[u.level] || `Lv${u.level}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===== v63 P2-C: 祖先链面包屑 ===== */}
      {ancestors.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4 border border-gray-100">
          <div className="flex items-start gap-2">
            <GitBranch className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 font-medium mb-1.5">祖先链（从顶级到「{selectedUserLabel || '当前用户'}」）</p>
              <div className="flex items-center flex-wrap gap-y-1 text-xs">
                {ancestors.map((a, idx) => (
                  <span key={a.id} className="inline-flex items-center">
                    <button
                      onClick={() => loadTree(a.id, a.nickname || a.phone)}
                      className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                    >
                      {a.nickname || a.phone}
                    </button>
                    {idx < ancestors.length - 1 && (
                      <ChevronRight className="w-3 h-3 mx-1 text-gray-400" />
                    )}
                  </span>
                ))}
                {focusUserId && (
                  <>
                    <ChevronRight className="w-3 h-3 mx-1 text-gray-400" />
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                      {selectedUserLabel || '当前用户'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 顶部摘要条（新增） ===== */}
      {summary && (
        <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-emerald-50 rounded-xl shadow-lg p-5 mb-4 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-semibold text-purple-800">团队概览 — {selectedUserLabel}</span>
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
                <ChevronRight className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500">最深层级</span>
              </div>
              <p className="text-xl font-bold text-purple-600">第 {summary.maxLevelReached} 层</p>
            </div>
          </div>
        </div>
      )}

      {/* 状态栏 */}
      {selectedUserId && (
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-700">
              当前用户：<span className="font-medium text-gray-900">{selectedUserLabel}</span>
            </span>
            {tree && (
              <span className="text-sm text-gray-500">
                共 {nodeCount} 人，{maxLevel} 层
              </span>
            )}
            {truncated && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">
                节点过多，仅显示部分
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleZoom(0.2)}
              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              title="放大"
            >
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => handleZoom(-0.2)}
              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleReset}
              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              title="重置视图"
            >
              <Maximize className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleReload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300
                hover:bg-gray-50 transition-colors text-sm text-gray-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </div>
      )}

      {/* 图例 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">等级图例：</span>
          {Object.entries(LEVEL_NAMES).map(([lv, name]) => (
            <span key={lv} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: LEVEL_COLORS[Number(lv)] }}
              />
              {name}
            </span>
          ))}
          <span className="ml-2 text-gray-400">| 💡 单击节点查看详情 · 双击折叠/展开</span>
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
            style={{ height: '650px', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            onEvents={{
              click: handleChartClick,
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <Network className="w-12 h-12 mb-3" />
            <p>请搜索并选择一个用户查看推荐关系图</p>
          </div>
        )}
      </div>

      {/* 节点详情弹窗 */}
      {detailNode && (
        <NodeDetailModal node={detailNode} onClose={() => setDetailNode(null)} />
      )}
    </>
  )
}
