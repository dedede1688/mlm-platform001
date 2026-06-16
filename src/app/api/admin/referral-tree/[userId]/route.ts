import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'

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

interface FlatUser {
  id: string
  phone: string
  nickname: string | null
  level: number
  avatarUrl: string | null
  totalPoints: number
  directSalesAmount: number
  parentId: string | null
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

  try {
    const { userId } = await params
    const { searchParams } = new URL(request.url)
    const maxLevel = Math.min(Math.max(Number(searchParams.get('maxLevel')) || 3, 1), 5)

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
        createdAt: true,
      },
    })

    if (!rootUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 一次性查询所有以该用户为祖先的用户（通过 parentId 逐级追溯，构建安置树）
    const allUsers: FlatUser[] = [rootUser as FlatUser]
    const visitedIds = new Set<string>([userId])
    let currentLevelIds = [userId]
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

    // 批量查询每个用户的订单数
    const allUserIds = allUsers.map(u => u.id)
    const orderCounts = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: allUserIds }, status: { not: 'cancelled' } },
      _count: { id: true },
    })
    const orderCountMap = new Map(orderCounts.map(o => [o.userId, o._count.id]))

    // 批量查询每个用户的直接下级安置人数（teamCount，基于 parentId）
    const referralCounts = await prisma.user.groupBy({
      by: ['parentId'],
      where: { parentId: { in: allUserIds } },
      _count: { id: true },
    })
    const teamCountMap = new Map(referralCounts.map(r => [r.parentId, r._count.id]))

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
      })
    }

    // 第二遍：挂载子节点
    let root: TreeNode | null = null
    for (const u of allUsers) {
      const node = nodeMap.get(u.id)!
      if (u.id === userId) {
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
