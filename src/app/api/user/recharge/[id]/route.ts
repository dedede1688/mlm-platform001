import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const { id } = await params
    const recharge = await RechargeService.getUserRechargeRequestById(auth.userId, id)

    if (!recharge) {
      return errorResponse('充值申请记录不存在', 404)
    }

    return successResponse(recharge)
  } catch (error) {
    logger.error('Get recharge request detail error:', error)
    return errorResponse('获取充值申请详情失败', 500)
  }
}
