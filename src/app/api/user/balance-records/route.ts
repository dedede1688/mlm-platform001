import { NextRequest } from 'next/server'
import { UserService } from '@/lib/services/user.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const type = searchParams.get('type') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const result = await UserService.getUserBalanceRecords(auth.userId, page, limit, {
      type,
      startDate,
      endDate,
    })

    return successResponse(result)
  } catch (error) {
    logger.error('Get balance records error:', error)
    return errorResponse('获取余额流水失败', 500)
  }
}
