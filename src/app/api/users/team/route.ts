import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

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

  const children = await UserService.getReferrals(parentId)

  if (children.length === 0) return []

  const results: TreeNode[] = []
  for (const child of children) {
    const grandchildren = await fetchChildren(child.id, depth + 1)

    results.push({
      id: child.id,
      phone: child.phone,
      nickname: child.nickname,
      level: child.level,
      avatarUrl: null,
      totalPoints: child.totalPoints,
      directSalesAmount: child.directSalesAmount,
      orderCount: 0,
      teamCount: grandchildren.reduce((sum, gc) => sum + 1 + gc.teamCount, 0),
      createdAt: child.createdAt instanceof Date ? child.createdAt.toISOString() : String(child.createdAt),
      children: grandchildren,
      referrerId: parentId,
      referrerInfo: null,
      referralCount: 0,
    })
  }

  return results
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('tree')

    if (mode === 'true') {
      const tree = await fetchChildren(auth.userId, 0)
      return NextResponse.json({ success: true, data: tree })
    }

    const teamMembers = await UserService.getReferrals(auth.userId)

    const formattedMembers = teamMembers.map((member) => ({
      id: member.id,
      phone: member.phone,
      nickname: member.nickname,
      level: member.level,
      createdAt: member.createdAt instanceof Date ? member.createdAt.toISOString() : String(member.createdAt),
      directCount: 0,
    }))

    return NextResponse.json({ success: true, data: formattedMembers })
  } catch (error) {
    logger.error('获取团队成员失败:', error)
    return NextResponse.json({ success: false, error: '获取团队成员失败' }, { status: 500 })
  }
}
