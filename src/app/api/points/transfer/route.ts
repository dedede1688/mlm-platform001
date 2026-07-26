import { NextRequest, NextResponse } from 'next/server'
import { PointsService } from '@/lib/services/points.service'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { toUserPhone, points } = await request.json()

    if (!toUserPhone || !points || points <= 0) {
      return NextResponse.json(
        { error: '参数错误' },
        { status: 400 }
      )
    }

    const toUser = await PointsService.findUserByPhone(toUserPhone)

    if (!toUser) {
      return NextResponse.json(
        { error: '接收用户不存在' },
        { status: 404 }
      )
    }

    const result = await PointsService.transferPoints(user.userId, toUser.id, points, `积分转账`)

    return NextResponse.json({
      success: true,
      data: {
        fromUser: {
          id: result.fromUser.id,
          phone: result.fromUser.phone,
          nickname: result.fromUser.nickname,
        },
        toUser: {
          id: result.toUser.id,
          phone: result.toUser.phone,
          nickname: result.toUser.nickname,
        },
        amount: result.amount,
        feeAmount: result.feeAmount,
        totalDeduction: result.totalDeduction,
      },
    })
  } catch (error: unknown) {
    logger.error('积分转账失败:', error)
    return NextResponse.json(
      { error: '积分转账失败' },
      { status: 500 }
    )
  }
}
