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

    const pointsRecords = await PointsService.getUserPointsRecords(auth.userId)

    return successResponse(pointsRecords)
  } catch (error) {
    logger.error('获取积分记录失败:', error)
    return errorResponse('获取积分记录失败', 500)
  }
}
