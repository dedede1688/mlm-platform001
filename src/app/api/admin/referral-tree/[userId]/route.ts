import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
// ---- v38: 内存缓存 (30s TTL) ----

const apiCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30 * 1000

function getCacheKey(userId: string, maxLevel: number): string {
  return `${userId}:${maxLevel}`
}

function getCached(key: string): any | null {
  const entry = apiCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    apiCache.delete(key)
    return null
  }
  return entry.data
}

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
  referrerId: string | null     // v37
  referrerInfo: { id: string; nickname: string | null; phoneTail: string } | null  // v37
}

interface FlatUser {
  id: string
  phone: string
  nickname: string | null
  level: number
  avatarUrl: string | null
  totalPoints: number
  directSalesAmount: number
  parentId: string | null
  referrerId: string | null   // v37
  createdAt: Date
}

const MAX_NODES = 1000

// ---- GET /api/admin/referral-tree/[userId] ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user: admin, error: authError } = await verifyPermission(request, ['admin', 'super_admin'])
  if (authError || !admin) return authError!

  // v38: 缓存检查
  const { userId } = await params
  const { searchParams } = new URL(request.url)
  const maxLevel = Math.min(Math.max(Number(searchParams.get('maxLevel')) || 3, 1), 5)
  const mode = searchParams.get('mode') || 'root'  // v39: 'root' | 'boundary'
  const cacheKey = getCacheKey(userId, maxLevel)
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {

    // 查询根用户
    const rootUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        level: true,
        avatarUrl: true,
        totalPoints: true,
        directSalesAmount: true,
        parentId: true,
        referrerId: true,
        createdAt: true,
      },
    })

    if (!rootUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // v39: mode=boundary — 从顶级祖先视角构建完整树（一次请求搞定前后端剪枝所需数据）
    let actualRootId = userId
    let originalUserId = userId  // v39: 记录原始请求的 userId（focus 用）

    if (mode === 'boundary' && rootUser.parentId) {
      // 先查父链找到顶级祖先
      let ancId: string | null = rootUser.parentId
      const visitedAnc = new Set<string>()
      const tempAncestors: Array<{id: string; nickname: string | null; phone: string}> = []
      for (let i = 0; i < 10 && ancId; i++) {
        if (visitedAnc.has(ancId)) break
        visitedAnc.add(ancId)
        const anc: { id: string; nickname: string | null; phone: string; parentId: string | null } | null = await prisma.user.findUnique({
          where: { id: ancId },
          select: { id: true, nickname: true, phone: true, parentId: true },
        })
        if (!anc) break
        tempAncestors.unshift({ id: anc.id, nickname: anc.nickname, phone: anc.phone })
        ancId = anc.parentId
      }
      // 用顶级祖先作为树的根（如果有的话）
      if (tempAncestors.length > 0) {
        actualRootId = tempAncestors[0].id
      }
    }

    // 如果 actualRootId != userId，需要重新查 rootUser 为 actualRootId
    let effectiveRootUser = rootUser
    if (actualRootId !== userId) {
      const queried = await prisma.user.findUnique({
        where: { id: actualRootId },
        select: {
          id: true, phone: true, nickname: true, level: true, avatarUrl: true,
          totalPoints: true, directSalesAmount: true, parentId: true, referrerId: true, createdAt: true,
        },
      })
      if (!queried) {
        return NextResponse.json({ success: false, error: '根用户不存在' }, { status: 404 })
      }
      effectiveRootUser = queried
    }

    // 一次性查询所有以该用户为祖先的用户（通过 parentId 逐级追溯，构建安置树）
    const allUsers: FlatUser[] = [effectiveRootUser as FlatUser]
    const visitedIds = new Set<string>([actualRootId])
    let currentLevelIds = [actualRootId]
    let truncated = false

    for (let depth = 0; depth < maxLevel; depth++) {
      if (currentLevelIds.length === 0) break

      const nextLevel = await prisma.user.findMany({
        where: {
          parentId: { in: currentLevelIds },
        },
        select: {
          id: true,
          phone: true,
          nickname: true,
          level: true,
          avatarUrl: true,
          totalPoints: true,
          directSalesAmount: true,
          parentId: true,
          referrerId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      if (nextLevel.length === 0) break

      const remaining = MAX_NODES - allUsers.length
      if (remaining <= 0) {
        truncated = true
        break
      }

      const toAdd = nextLevel.slice(0, remaining)
      for (const u of toAdd) {
        if (!visitedIds.has(u.id)) {
          allUsers.push(u as FlatUser)
          visitedIds.add(u.id)
        }
      }

      if (toAdd.length < nextLevel.length) {
        truncated = true
        break
      }

      currentLevelIds = toAdd.map(u => u.id)
    }

    // v38: 并行查询 — 三个独立 DB 查询同时执行
    const allUserIds = allUsers.map(u => u.id)
    const allReferrerIds = allUsers
      .map(u => u.referrerId)
      .filter((id): id is string => !!id && allUsers.some(u => u.id === id))

    const [orderCounts, referralCounts, referrers] = await Promise.all([
      prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { in: allUserIds }, status: { not: 'cancelled' } },
        _count: { id: true },
      }),
      prisma.user.groupBy({
        by: ['parentId'],
        where: { parentId: { in: allUserIds } },
        _count: { id: true },
      }),
      // 推荐人信息查询（无 referrerId 时传空数组避免无效查询）
      prisma.user.findMany({
        where: { id: { in: allReferrerIds.length > 0 ? allReferrerIds : ['__empty__'] } },
        select: { id: true, nickname: true, phone: true },
      }),
    ])

    const orderCountMap = new Map(orderCounts.map(o => [o.userId, o._count.id]))
    const teamCountMap = new Map(referralCounts.map(r => [r.parentId, r._count.id]))
    const referrerInfoMap = new Map(referrers.map(r => [r.id, r]))

    // 在内存中构建树
    const nodeMap = new Map<string, TreeNode>()
    for (const u of allUsers) {
      nodeMap.set(u.id, {
        id: u.id,
        phone: u.phone,
        nickname: u.nickname,
        level: u.level,
        avatarUrl: u.avatarUrl,
        totalPoints: u.totalPoints,
        directSalesAmount: u.directSalesAmount,
        orderCount: orderCountMap.get(u.id) ?? 0,
        teamCount: teamCountMap.get(u.id) ?? 0,
        createdAt: u.createdAt.toISOString(),
        children: [],
        referrerId: u.referrerId,
        referrerInfo: (() => { const ref = referrerInfoMap.get(u.referrerId || ''); return ref ? { id: ref.id, nickname: ref.nickname, phoneTail: ref.phone.slice(-4) } : null })(),
      })
    }

    // 第二遍：挂载子节点
    let root: TreeNode | null = null
    for (const u of allUsers) {
      const node = nodeMap.get(u.id)!
      if (u.id === actualRootId) {
        root = node
      } else if (u.parentId && nodeMap.has(u.parentId)) {
        nodeMap.get(u.parentId)!.children.push(node)
      }
    }

    // v34：查询父链（ancestors）— 从当前 root 向上追溯安置父节点，最多 10 层防死循环
    const ancestors: { id: string; nickname: string | null; phone: string }[] = []
    let currentAncestorId: string | null = rootUser.parentId
    const visitedAncestorIds = new Set<string>()
    for (let i = 0; i < 10 && currentAncestorId; i++) {
      if (visitedAncestorIds.has(currentAncestorId)) break // 防环
      visitedAncestorIds.add(currentAncestorId)
      const parent = await prisma.user.findUnique({
        where: { id: currentAncestorId },
        select: { id: true, phone: true, nickname: true, parentId: true },
      })
      if (!parent) break
      ancestors.unshift({ id: parent.id, nickname: parent.nickname, phone: parent.phone }) // 从顶级到当前 root 的父
      currentAncestorId = parent.parentId
    }

    const response: {
      success: boolean
      data: TreeNode | null
      truncated?: boolean
      nodeCount?: number
      summary?: {
        totalTeam: number
        totalSales: number
        totalOrders: number
        maxLevelReached: number
      }
      ancestors?: { id: string; nickname: string | null; phone: string }[]
      rootParentId?: string | null
      focusUserId?: string           // v39: 原始请求的 userId（前端 focus 用）
      boundaryParentId?: string | null  // v39: 原始 userId 的直接父级（前端剪枝用）
    } = {
      success: true,
      data: root,
    }

    if (truncated) {
      response.truncated = true
      response.nodeCount = allUsers.length
    }

    // 计算摘要信息（根用户的整个团队）
    if (root) {
      response.summary = {
        totalTeam: countNodes(root) - 1, // 排除自己
        totalSales: sumDirectSales(root),
        totalOrders: sumOrderCounts(root),
        maxLevelReached: getMaxDepth(root),
      }
    }

    // v32：返回父链 + root 的直接父节点 ID（用于"返回上级"按钮）
    if (ancestors.length > 0) {
      response.ancestors = ancestors
      response.rootParentId = rootUser.parentId
    }

    // v39: 返回焦点信息供前端剪枝
    response.focusUserId = originalUserId
    response.boundaryParentId = rootUser.parentId

    // v38: 写入缓存
    apiCache.set(cacheKey, { data: response, timestamp: Date.now() })
    return NextResponse.json(response)
  } catch (error) {
    console.error('获取推荐树失败:', error)
    return NextResponse.json(
      { success: false, error: '获取推荐树失败' },
      { status: 500 }
    )
  }
}

// ---- 辅助函数 ----

function countNodes(node: TreeNode): number {
  if (!node) return 0
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}

function sumDirectSales(node: TreeNode): number {
  if (!node) return 0
  return node.directSalesAmount + node.children.reduce((sum, c) => sum + sumDirectSales(c), 0)
}

function sumOrderCounts(node: TreeNode): number {
  if (!node) return 0
  return node.orderCount + node.children.reduce((sum, c) => sum + sumOrderCounts(c), 0)
}

function getMaxDepth(node: TreeNode, depth = 1): number {
  if (!node || node.children.length === 0) return depth
  return Math.max(...node.children.map(c => getMaxDepth(c, depth + 1)))
}
