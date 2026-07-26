import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const settings = await RechargeService.getRechargeSettings()

    return successResponse(settings)
  } catch (error) {
    logger.error('Get recharge settings error:', error)
    return errorResponse('获取充值设置失败', 500)
  }
}
