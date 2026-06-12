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
  children: TreeNode[]
}

interface FlatUser {
  id: string
  phone: string
  nickname: string | null
  level: number
  avatarUrl: string | null
  totalPoints: number
  referrerId: string | null
}

const MAX_NODES = 1000

// ---- GET /api/admin/referral-tree/[userId] ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await verifyPermission(request, ['admin', 'super_admin'])
  if (!admin) {
    return NextResponse.json(
      { success: false, error: '无权访问' },
      { status: 403 }
    )
  }

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
        referrerId: true,
      },
    })

    if (!rootUser) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    // 一次性查询所有以该用户为祖先的用户（通过 referrerId 逐级追溯）
    // 策略：反复查询，每轮找出上一轮用户的直接推荐人，直到达到 maxLevel 或无更多用户
    const allUsers: FlatUser[] = [rootUser as FlatUser]
    const visitedIds = new Set<string>([userId])
    let currentLevelIds = [userId]
    let truncated = false

    for (let depth = 0; depth < maxLevel; depth++) {
      if (currentLevelIds.length === 0) break

      // 查询这些用户的直接下级
      const nextLevel = await prisma.user.findMany({
        where: {
          referrerId: { in: currentLevelIds },
        },
        select: {
          id: true,
          phone: true,
          nickname: true,
          level: true,
          avatarUrl: true,
          totalPoints: true,
          referrerId: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      if (nextLevel.length === 0) break

      // 检查节点数量上限
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
        children: [],
      })
    }

    // 第二遍：挂载子节点
    let root: TreeNode | null = null
    for (const u of allUsers) {
      const node = nodeMap.get(u.id)!
      if (u.id === userId) {
        root = node
      } else if (u.referrerId && nodeMap.has(u.referrerId)) {
        nodeMap.get(u.referrerId)!.children.push(node)
      }
    }

    const response: {
      success: boolean
      data: TreeNode | null
      truncated?: boolean
      nodeCount?: number
    } = {
      success: true,
      data: root,
    }

    if (truncated) {
      response.truncated = true
      response.nodeCount = allUsers.length
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