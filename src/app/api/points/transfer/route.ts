import { NextRequest } from 'next/server'
import { PointsService } from '@/lib/services/points.service'
import { verifyToken } from '@/lib/utils/auth'

import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'


export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const { toUserPhone, points } = await request.json()

    if (!toUserPhone || !points || points <= 0) {
      return errorResponse('参数错误', 400)
    }

    const toUser = await PointsService.findUserByPhone(toUserPhone)

    if (!toUser) {
      return errorResponse('接收用户不存在', 404)
    }

    const result = await PointsService.transferPoints(user.userId, toUser.id, points, '积分转账')

    return successResponse({
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
    })
  } catch (error: unknown) {
    logger.error('积分转账失败:', error)
    return errorResponse('积分转账失败', 500)
  }
}
