import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

interface TreeNode {
  id: string
  phone: string
  nickname: string | null
  level: number
  children: TreeNode[]
}

// 递归获取推荐树
async function buildReferralTree(userId: string, depth: number, maxDepth: number): Promise<TreeNode> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, nickname: true, level: true },
  })

  const node: TreeNode = {
    id: user?.id || userId,
    phone: user?.phone || '',
    nickname: user?.nickname || null,
    level: user?.level ?? 0,
    children: [],
  }

  if (depth >= maxDepth) return node

  // 获取直接推荐的下级
  const referrals = await prisma.user.findMany({
    where: { referrerId: userId, status: { not: 'deleted' } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const ref of referrals) {
    const child = await buildReferralTree(ref.id, depth + 1, maxDepth)
    node.children.push(child)
  }

  return node
}

// GET /api/admin/users/[id]/referral-tree — 获取推荐关系树（管理员）
// 递归获取下级用户，最多三层
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user || (await prisma.user.findUnique({ where: { id } }))?.status === 'deleted') {
      return NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 404 }
      )
    }

    const tree = await buildReferralTree(id, 0, 3)

    return NextResponse.json({
      success: true,
      data: tree,
      message: '获取推荐关系树成功',
    })
  } catch (error) {
    console.error('Admin get referral tree error:', error)
    return NextResponse.json(
      { success: false, message: '获取推荐关系树失败' },
      { status: 500 }
    )
  }
}