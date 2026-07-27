import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { validateRefundApplication } from '@/lib/refunds/refund-validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const body = await request.json()
    const validation = validateRefundApplication({
      reason: body?.reason,
      description: body?.description,
      images: body?.images,
    })

    if (!validation.success) {
      return errorResponse(validation.error, 400)
    }

    const normalized = validation.data
    const refundRequest = await OrderLifecycleService.createRefundRequest(orderId, user.userId, {
      reason: normalized.reason,
      description: normalized.description ?? '',
      images: normalized.images ?? [],
    })

    return successResponse(refundRequest, '退款申请已提交')
  } catch (error) {
    logger.error('Create refund request error:', error)
    const msg = error instanceof Error ? error.message : '申请退款失败'
    return errorResponse(msg, 400)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const refundRequests = await OrderLifecycleService.getOrderRefunds(orderId, user.userId, user.role)

    return successResponse(refundRequests)
  } catch (error) {
    logger.error('Get refund requests error:', error)
    const msg = error instanceof Error ? error.message : '获取退款申请失败'
    return errorResponse(msg, 403)
  }
}
