import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

const MAX_DEPTH = 10

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
  referrerId: string | null
  referrerInfo: { id: string; nickname: string | null; phoneTail: string } | null
  referralCount: number
}

async function fetchChildren(parentId: string, depth: number): Promise<TreeNode[]> {
  if (depth >= MAX_DEPTH) return []

  const children = await prisma.user.findMany({
    where: { referrerId: parentId },
    select: {
      id: true,
      phone: true,
      nickname: true,
      level: true,
      totalPoints: true,
      directSalesAmount: true,
      createdAt: true,
      _count: { select: { referrals: true, orders: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (children.length === 0) return []

  const results: TreeNode[] = []
  for (const child of children) {
    // 递归查下级（depth < MAX_DEPTH 时继续）
    const grandchildren = await fetchChildren(child.id, depth + 1)

    results.push({
      id: child.id,
      phone: child.phone,
      nickname: child.nickname,
      level: child.level,
      avatarUrl: null,
      totalPoints: child.totalPoints,
      directSalesAmount: child.directSalesAmount,
      orderCount: child._count.orders,
      teamCount: child._count.referrals + grandchildren.reduce((sum, gc) => sum + 1 + gc.teamCount, 0),
      createdAt: child.createdAt.toISOString(),
      children: grandchildren,
      referrerId: parentId,
      referrerInfo: null,
      referralCount: child._count.referrals,
    })
  }

  return results
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('tree')

    if (mode === 'true') {
      // 树形模式：递归 10 层
      const tree = await fetchChildren(auth.userId, 0)

      return NextResponse.json({ success: true, data: tree })
    }

    // 默认：平铺直推列表
    const teamMembers = await prisma.user.findMany({
      where: { referrerId: auth.userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        level: true,
        createdAt: true,
        _count: { select: { referrals: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formattedMembers = teamMembers.map((member) => ({
      id: member.id,
      phone: member.phone,
      nickname: member.nickname,
      level: member.level,
      createdAt: member.createdAt.toISOString(),
      directCount: member._count.referrals,
    }))

    return NextResponse.json({ success: true, data: formattedMembers })
  } catch (error) {
    console.error('获取团队成员失败:', error)
    return NextResponse.json(
      { success: false, error: '获取团队成员失败' },
      { status: 500 }
    )
  }
}
