import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/users — 获取会员列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const levelParam = searchParams.get('level')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''

    // 构建查询条件
    const where: Record<string, unknown> = {
      status: { not: 'deleted' },
    }

    if (levelParam !== '') {
      where.level = parseInt(levelParam)
    }

    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { nickname: { contains: search } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          phone: true,
          nickname: true,
          level: true,
          balance: true,
          frozenBalance: true,
          consumeBalance: true,
          earningsPending: true,
          earningsAvailable: true,
          earningsVoided: true,
          totalPoints: true,
          unlockedPoints: true,
          lockedPoints: true,
          referrerId: true,
          parentId: true,
          position: true,
          upgradeProductCount: true,
          directSalesAmount: true,
          directDistributorCount: true,
          status: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          referrer: {
            select: { id: true, nickname: true, phone: true },
          },
          _count: {
            select: { referrals: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    // 格式化返回数据
    const data = users.map(u => ({
      ...u,
      referrer: u.referrer
        ? { id: u.referrer.id, nickname: u.referrer.nickname, phone: u.referrer.phone }
        : null,
      directReferralCount: u._count.referrals,
      _count: undefined,
      referrerId: undefined,
    }))

    return NextResponse.json({
      success: true,
      data,
      message: '获取会员列表成功',
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Admin get users error:', error)
    return NextResponse.json(
      { success: false, message: '获取会员列表失败' },
      { status: 500 }
    )
  }
}