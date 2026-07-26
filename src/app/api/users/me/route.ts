import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { getBusinessConfig } from '@/lib/config/business'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = await UserService.getProfile(auth.userId)
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    const referralRate = await getBusinessConfig<number>('reward.referral_rate', 0.20)
    const brandBonusRate = await getBusinessConfig<number>('reward.brand_bonus_rate', 0.20)

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
        consumeBalance: user.consumeBalance ?? 0,
        earningsPending: user.earningsPending ?? 0,
        earningsAvailable: user.earningsAvailable ?? 0,
        earningsFrozen: user.earningsFrozen ?? 0,
        earningsVoided: user.earningsVoided ?? 0,
        totalPoints: user.totalPoints,
        unlockedPoints: user.unlockedPoints,
        lockedPoints: user.lockedPoints,
        referrerId: user.referrerId,
        parentId: user.parentId,
        directDistributorCount: user.directDistributorCount,
        directSalesAmount: user.directSalesAmount,
        upgradeProductCount: user.upgradeProductCount ?? 0,
        hasUpgradeProduct: (user.upgradeProductCount ?? 0) >= 1,
        hasPaymentPassword: !!user.paymentPasswordHash,
        referrals: user.referrals,
        createdAt: user.createdAt,
        referralRate,
        brandBonusRate,
      },
    })
  } catch (error) {
    logger.error('Get user error:', error)
    return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { nickname, avatarUrl, email } = await request.json()

    const user = await UserService.updateProfile(auth.userId, { nickname, avatarUrl, email })

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
    logger.error('Update user error:', error)
    return NextResponse.json({ error: '更新用户信息失败' }, { status: 500 })
  }
}
