'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Network, Search, Loader2, ChevronLeft, Users, RefreshCw, ZoomIn, ZoomOut, Maximize
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
  children: TreeNode[]
}

interface UserSearchItem {
  id: string
  phone: string
  nickname: string | null
  level: number
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

// ---- 转换为 ECharts 树数据 ----

function toEChartsTree(node: TreeNode): Record<string, unknown> {
  const color = LEVEL_COLORS[node.level] || '#6b7280'
  const name = node.nickname
    ? `${node.nickname}\n${node.phone}`
    : node.phone

  return {
    name,
    value: node.level,
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
  const [maxLevel, setMaxLevel] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    const lvl = level ?? maxLevel
    try {
      const res = await fetch(`/api/admin/referral-tree/${userId}?maxLevel=${lvl}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setTree(data.data)
        setTruncated(data.truncated || false)
        setNodeCount(data.nodeCount || countNodes(data.data))
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

  // ---- ECharts 配置 ----

  const chartOption = useMemo(() => {
    if (!tree) return {}
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: { data: Record<string, unknown>; treeAncestors: Array<{ data: Record<string, unknown> }> }) => {
          const d = params.data
          const depth = params.treeAncestors?.length ?? 1
          const lv = Number(d.value ?? 0)
          return `<div style="font-size:13px;line-height:1.6">
            <b>${String(d.name).replace(/\n/g, ' ')}</b><br/>
            等级：${LEVEL_NAMES[lv] || lv}<br/>
            层级：第 ${depth} 层<br/>
            子节点：${(d.children as unknown[])?.length ?? 0}
          </div>`
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
          initialTreeDepth: 3,
          lineStyle: {
            color: '#d1d5db',
            width: 1.5,
            curveness: 0.5,
          },
        },
      ],
    }
  }, [tree])

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
            style={{ height: '600px', width: '100%' }}
            opts={{ renderer: 'canvas' }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <Network className="w-12 h-12 mb-3" />
            <p>请搜索并选择一个用户查看推荐关系图</p>
          </div>
        )}
      </div>
    </>
  )
}