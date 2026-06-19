import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'

// 获取当前用户信息
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        referrals: {
          select: {
            id: true,
            phone: true,
            nickname: true,
            level: true,
            createdAt: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      )
    }

    // 实时校正直推经销商数量（防止字段与实际不一致）
    const actualDistributorCount = await prisma.user.count({
      where: {
        referrerId: auth.userId,
        level: { gte: 2 },
      },
    })
    if (actualDistributorCount !== user.directDistributorCount) {
      await prisma.user.update({
        where: { id: auth.userId },
        data: { directDistributorCount: actualDistributorCount },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        level: user.level,
        balance: user.balance,
        frozenBalance: user.frozenBalance,
        totalPoints: user.totalPoints,
        unlockedPoints: user.unlockedPoints,
        lockedPoints: user.lockedPoints,
        referrerId: user.referrerId,
        parentId: user.parentId,
        directDistributorCount: actualDistributorCount,
        directSalesAmount: user.directSalesAmount,
        upgradeProductCount: user.upgradeProductCount,
        hasPaymentPassword: !!user.paymentPasswordHash, // v43-4: 前端判断设置/修改模式
        referrals: user.referrals,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: '获取用户信息失败' },
      { status: 500 }
    )
  }
}

// 更新用户信息
export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { nickname, avatarUrl, email } = await request.json()

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: {
        nickname,
        avatarUrl,
        email,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        email: user.email,
      },
    })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json(
      { error: '更新用户信息失败' },
      { status: 500 }
    )
  }
}
