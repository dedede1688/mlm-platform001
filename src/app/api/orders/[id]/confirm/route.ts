import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    await OrderLifecycleService.confirmOrder(id, user.userId)

    return successResponse(null, '确认收货成功')
  } catch (error: unknown) {
    logger.error('Confirm order error:', error)
    const msg = error instanceof Error ? error.message : '确认收货失败'
    return errorResponse(msg, 400)
  }
}
