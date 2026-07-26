import { NextRequest } from 'next/server'
import { PointsService } from '@/lib/services/points.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const schedules = await PointsService.getUserUnlockSchedules(auth.userId)

    return successResponse(schedules)
  } catch (error) {
    logger.error('获取积分解锁计划失败:', error)
    return errorResponse('获取积分解锁计划失败', 500)
  }
}
