'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Users, ArrowLeft, ChevronLeft, ChevronRight,
  Search, UserPlus, Copy, Check, List, Network
} from 'lucide-react'
import ReferralTreeView, { TreeNode } from '@/components/ReferralTreeView'

// ---- 类型 ----

interface TeamMember {
  id: string
  phone: string
  nickname?: string | null
  level: number
  createdAt: string
  directCount: number
}

interface UserInfo {
  id: string
  phone: string
  nickname?: string | null
  level: number
  directDistributorCount: number
}

// ---- 等级配置 ----

const LEVEL_BADGE: Record<number, { name: string; color: string; dot: string }> = {
  0: { name: '游客', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  1: { name: '会员', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
  2: { name: '经销商', color: 'bg-green-100 text-green-700', dot: 'bg-green-400' },
  3: { name: '主任', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
  4: { name: '经理', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  5: { name: '总监', color: 'bg-pink-100 text-pink-700', dot: 'bg-pink-400' },
  6: { name: '总裁', color: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
  7: { name: '董事', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
}

// ---- 主组件 ----

export default function TeamPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const pageSize = 10

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    fetchAll(storedToken)
  }, [router])

  const fetchAll = async (authToken: string) => {
    try {
      const [userRes, teamRes] = await Promise.allSettled([
        fetch('/api/users/me', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/users/team', { headers: { Authorization: `Bearer ${authToken}` } }),
      ])

      if (userRes.status === 'fulfilled' && userRes.value.ok) {
        const data = await userRes.value.json()
        if (data.success) setUser(data.data)
      }

      if (teamRes.status === 'fulfilled' && teamRes.value.ok) {
        const data = await teamRes.value.json()
        if (data.success) setMembers(data.data || [])
      }
    } catch (err) {
      console.error('获取团队数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchTreeData = async () => {
    const authToken = localStorage.getItem('token')
    if (!authToken) return
    try {
      const res = await fetch('/api/users/team?tree=true', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setTreeData(data.data || [])
      }
    } catch (err) {
      console.error('获取树形数据失败:', err)
    }
  }

  const handleSwitchView = (mode: 'list' | 'tree') => {
    setViewMode(mode)
    if (mode === 'tree' && treeData.length === 0) {
      fetchTreeData()
    }
  }

  // 搜索过滤
  const filtered = members.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.phone.toLowerCase().includes(q) ||
      (m.nickname && m.nickname.toLowerCase().includes(q))
    )
  })

  // 统计
  const directMemberCount = members.length
  const directDistributorCount = members.filter((m) => m.level >= 2).length
  const teamTotal = members.reduce((sum, m) => sum + 1 + m.directCount, 0)

  // 分页
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleCopyReferralCode = () => {
    if (user) {
      navigator.clipboard.writeText(user.phone)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatRelativeTime = (s: string) => {
    const diff = Date.now() - new Date(s).getTime()
    const days = Math.floor(diff / 86400000)
    if (days < 1) return '今天'
    if (days < 30) return `${days}天前`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}个月前`
    return `${Math.floor(months / 12)}年前`
  }

  // ---- 加载态 ----
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-base p-5 animate-pulse">
                <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-8 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-base p-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-gray-200 rounded" />
                    <div className="h-3 w-1/2 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 返回 + 标题 + 视图切换 */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-primary hover:shadow-md transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            我的团队
          </h1>
          <div className="ml-auto flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => handleSwitchView('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5 inline mr-1" />
              列表
            </button>
            <button
              onClick={() => handleSwitchView('tree')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'tree'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Network className="w-3.5 h-3.5 inline mr-1" />
              树形
            </button>
          </div>
        </div>

        {/* 树形视图 */}
        {viewMode === 'tree' && (
          <div className="card-base mb-6" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
            {treeData.length === 0 && user ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                <Network className="w-5 h-5 mr-2" />
                {loading ? '加载中...' : '暂无团队数据'}
              </div>
            ) : (
              <ReferralTreeView
                focusUserId={user?.id}
                data={{
                  id: user?.id ?? '',
                  phone: user?.phone ?? '',
                  nickname: user?.nickname ?? null,
                  level: user?.level ?? 0,
                  avatarUrl: null,
                  totalPoints: 0,
                  directSalesAmount: 0,
                  orderCount: 0,
                  teamCount: treeData.length,
                  referralCount: treeData.length,
                  createdAt: '',
                  children: treeData,
                  referrerId: null,
                  referrerInfo: null,
                }}
              />
            )}
          </div>
        )}

        {/* 列表视图 */}
        {viewMode === 'list' && (<>

        {/* 顶部统计卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-400">直推会员</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{directMemberCount}</p>
          </div>
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-400">直推经销商</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{user?.directDistributorCount ?? directDistributorCount}</p>
          </div>
          <div className="card-base p-5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-gray-400">团队总人数</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{teamTotal}</p>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="card-base p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="搜索手机号或昵称"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* 团队列表 */}
        {paged.length === 0 ? (
          <EmptyState user={user} copied={copied} onCopy={handleCopyReferralCode} />
        ) : (
          <div className="space-y-3">
            {paged.map((member) => (
              <MemberCard key={member.id} member={member} formatRelativeTime={formatRelativeTime} />
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-primary hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                  p === page
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'bg-white text-gray-600 hover:text-primary shadow-sm'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-primary hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
        </>)}
      </main>

    </div>
  )
}

// ---- 成员卡片 ----

function MemberCard({
  member,
  formatRelativeTime,
}: {
  member: TeamMember
  formatRelativeTime: (s: string) => string
}) {
  const badge = LEVEL_BADGE[member.level] || LEVEL_BADGE[1]
  const initial = member.nickname ? member.nickname.charAt(0) : member.phone.slice(-2)
  const isDistributor = member.level >= 2

  return (
    <div className="card-base p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        {/* 头像 */}
        <div className="relative flex-shrink-0">
          <div className={`w-11 h-11 rounded-full ${isDistributor ? 'bg-green-100' : 'bg-gray-100'} flex items-center justify-center`}>
            <span className={`font-semibold text-sm ${isDistributor ? 'text-green-600' : 'text-gray-500'}`}>{initial}</span>
          </div>
          {/* 等级小圆点 */}
          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${badge.dot}`} />
        </div>

        {/* 中部信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 truncate">{member.nickname || member.phone}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
              {badge.name}
            </span>
          </div>
          <p className="text-sm font-mono text-gray-400 mt-0.5">{member.phone}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>{formatRelativeTime(member.createdAt)}</span>
            <span>已推荐 {member.directCount} 人</span>
          </div>
        </div>

        {/* 右侧标签 */}
        <div className="flex-shrink-0 self-center">
          {isDistributor ? (
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 border border-green-200">
              经销商
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
              会员
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- 空状态 ----

function EmptyState({
  user,
  copied,
  onCopy,
}: {
  user: UserInfo | null
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="card-base p-16 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Users className="w-10 h-10 text-gray-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-500 mb-2">暂无团队成员</h3>
      <p className="text-sm text-gray-400 mb-4">分享您的推荐码，邀请好友加入平台</p>
      {user && (
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-50 rounded-lg">
          <span className="font-mono font-bold text-primary">{user.phone}</span>
          <button
            onClick={onCopy}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              copied ? 'bg-green-100 text-green-600' : 'bg-white text-primary hover:bg-primary-100 shadow-sm'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  )
}