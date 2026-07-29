import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { OrderService } from '@/lib/services/order.service'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

import { parseBody } from '@/lib/validations/helper'
import { orderStatusTransitionSchema } from '@/lib/validations/admin/orders'

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped'],
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

    let updated
    if (body.status === 'cancelled') {
      updated = await OrderLifecycleService.cancelOrder(id, '管理员取消')
    } else if (body.status === 'shipped') {
      updated = await OrderLifecycleService.shipOrder(id, body.trackingNumber?.trim())
    } else if (body.status === 'completed') {
      updated = await OrderLifecycleService.completeOrder(id)
    } else {
      const data: Record<string, unknown> = {
        status: body.status,
        ...(!order.paidAt ? { paidAt: new Date() } : {}),
      }
      updated = await OrderService.updateOrder(id, data)
    }

    await logOperation({
      userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
      oldValue: { status: order.status }, newValue: { status: body.status },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(updated)
  } catch (error) {
    logger.error('Admin update order status error:', error)
    const message = error instanceof Error ? error.message : ''
    if (message === '订单状态已变更，请刷新后重试' || message === '订单存在进行中的退款申请，不能完成') {
      return errorResponse(message, 409)
    }
    if (message === '订单状态不允许取消' || message === '订单不存在或状态已变更') {
      return errorResponse(message, 400)
    }
    return errorResponse('更新订单状态失败', 500)
  }
}
