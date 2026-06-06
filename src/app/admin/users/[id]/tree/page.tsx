'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Network, Loader2, ChevronLeft, ChevronRight, ChevronDown, Users
} from 'lucide-react'

// ---- 类型 ----

interface TreeNode {
  id: string
  phone: string
  nickname: string | null
  level: number
  children: TreeNode[]
}

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-600 border-gray-200',
  1: 'bg-blue-50 text-blue-700 border-blue-200',
  2: 'bg-green-50 text-green-700 border-green-200',
  3: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  4: 'bg-orange-50 text-orange-700 border-orange-200',
  5: 'bg-purple-50 text-purple-700 border-purple-200',
  6: 'bg-red-50 text-red-700 border-red-200',
  7: 'bg-amber-50 text-amber-800 border-amber-200',
}

const LEVEL_DOT_COLORS: Record<number, string> = {
  0: 'bg-gray-400', 1: 'bg-blue-500', 2: 'bg-green-500', 3: 'bg-yellow-500',
  4: 'bg-orange-500', 5: 'bg-purple-500', 6: 'bg-red-500', 7: 'bg-amber-600',
}

// ---- 递归树节点组件 ----

function TreeNodeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <div className="ml-0">
      <div className={`flex items-center gap-2 py-1.5 ${depth > 0 ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}`}>
        {/* 展开/折叠 */}
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors flex-shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </span>
        )}
        {/* 节点内容 */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${LEVEL_COLORS[node.level] || 'bg-gray-50 border-gray-200'}`}>
          <span className={`w-2 h-2 rounded-full ${LEVEL_DOT_COLORS[node.level] || 'bg-gray-400'}`} />
          <span className="text-sm font-medium">{node.phone}</span>
          {node.nickname && <span className="text-xs opacity-70">({node.nickname})</span>}
          <span className="text-xs px-1.5 py-0.5 rounded bg-white/60 font-medium">{LEVEL_NAMES[node.level]}</span>
          {hasChildren && <span className="text-xs opacity-60">[{node.children.length}]</span>}
        </div>
      </div>
      {/* 子节点 */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- 图例 ----

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
      <span className="font-medium text-gray-700">等级图例：</span>
      {Object.entries(LEVEL_NAMES).map(([lv, name]) => (
        <span key={lv} className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${LEVEL_DOT_COLORS[Number(lv)]}`} />
          {name}
        </span>
      ))}
    </div>
  )
}

// ---- 主页面 ----

export default function ReferralTreePage() {
  const params = useParams()
  const userId = params.id as string

  const [token, setToken] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
    }
  }, [])

  // 加载树数据
  useEffect(() => {
    if (!token) return
    const fetchTree = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/users/${userId}/referral-tree`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (data.success) {
          setTree(data.data)
        } else {
          setError(data.message || '获取推荐树失败')
        }
      } catch {
        setError('网络错误')
      } finally {
        setLoading(false)
      }
    }
    fetchTree()
  }, [token, userId])

  // 统计节点数
  const countNodes = (node: TreeNode | null): number => {
    if (!node) return 0
    return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
  }

  return (
    <>
      {/* 标题 */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
          </Link>
          <Network className="w-6 h-6 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">推荐关系树</h1>
          {tree && (
            <span className="text-sm text-gray-500 ml-2">（共 {countNodes(tree)} 人，最多 3 层）</span>
          )}
        </div>

        {/* 图例 */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <Legend />
        </div>

        {/* 树内容 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-red-500">
              <Network className="w-12 h-12 mb-3 opacity-50" />
              <p>{error}</p>
            </div>
          ) : tree ? (
            <div className="space-y-0">
              <TreeNodeItem node={tree} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Users className="w-12 h-12 mb-3" />
              <p>暂无数据</p>
            </div>
          )}
        </div>

        {/* 返回按钮 */}
        <div className="flex justify-center mt-6">
          <Link href="/admin/users"
            className="inline-flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
            <ChevronLeft className="w-4 h-4" />返回会员管理
          </Link>
        </div>
    </>
  )
}