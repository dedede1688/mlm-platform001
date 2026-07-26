import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { OrderService } from '@/lib/services/order.service'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'
import { parseBody } from '@/lib/validations/helper'
import { orderStatusTransitionSchema } from '@/lib/validations/admin/orders'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['completed'],
}

// PATCH /api/admin/orders/[id]/status — 更新订单状态
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError || !admin) return authError!

    const { id } = await params
    const order = await OrderService.getOrderById(id)
    if (!order) return errorResponse('订单不存在', 404)

    const { data: body, error: parseError } = await parseBody(orderStatusTransitionSchema, request)
    if (parseError) return parseError

    // 业务规则：状态转移合法性（Zod 无法表达的动态规则）
    const allowedNext = VALID_TRANSITIONS[order.status]
    if (!allowedNext || !allowedNext.includes(body.status)) {
      return errorResponse(`不允许从 ${order.status} 变更为 ${body.status}`, 400)
    }

    const data: Record<string, unknown> = { status: body.status }

    if (body.status === 'paid' && !order.paidAt) data.paidAt = new Date()
    if (body.status === 'shipped') {
      if (!order.shippedAt) data.shippedAt = new Date()
      if (body.trackingNumber && typeof body.trackingNumber === 'string') data.trackingNumber = body.trackingNumber.trim()
    }
    if (body.status === 'completed') data.completedAt = new Date()
    if (body.status === 'cancelled') data.cancelledAt = new Date()

    const updated = await OrderService.updateOrder(id, data)

    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
      oldValue: { status: order.status }, newValue: data,
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    if (body.status === 'shipped') await OrderNotificationService.notifyOrderShipped(id)
    else if (body.status === 'completed') await OrderNotificationService.notifyOrderCompleted(id)
    else if (body.status === 'cancelled') await OrderNotificationService.notifyOrderCancelled({
      orderId: id, reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : '管理员取消',
    })

    return successResponse(updated)
  } catch (error) {
    logger.error('Admin update order status error:', error)
    return errorResponse('更新订单状态失败', 500)
  }
}
