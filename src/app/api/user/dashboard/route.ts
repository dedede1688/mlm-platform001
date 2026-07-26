import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse('未登录', 401)
    }

    const data = await UserService.getUserDashboard(auth.userId)

    return successResponse(data)
  } catch (err) {
    logger.error('[dashboard]', err)
    return errorResponse(String(err), 500)
  }
}
