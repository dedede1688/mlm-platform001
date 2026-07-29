import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderService } from '@/lib/services/order.service'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'

import { parseBody } from '@/lib/validations/helper'
import { orderStatusActionSchema } from '@/lib/validations/admin/orders'

// GET /api/admin/orders/[id] — 获取订单详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const order = await OrderService.getAdminOrderDetail(id)
    if (!order) return errorResponse('订单不存在', 404)
    return successResponse(order, '获取订单成功')
  } catch (error) {
    logger.error('Admin get order error:', error)
    return errorResponse('获取订单失败', 500)
  }
}

// PUT /api/admin/orders/[id] — 更新订单状态
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params

    const { data: body, error: parseError } = await parseBody(orderStatusActionSchema, request)
    if (parseError) return parseError

    if (body.action === 'ship') {
      const updated = await OrderLifecycleService.shipOrder(id, body.trackingNumber.trim())
      await logOperation({
        userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
        newValue: { trackingNumber: body.trackingNumber.trim() },
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch(() => {})
      await OrderNotificationService.notifyOrderShipped(id).catch(() => {})
      return successResponse(updated, '发货成功')
    } else {
      const updated = await OrderLifecycleService.cancelOrder(id)
      await logOperation({
        userId: admin.id, action: 'UPDATE', module: 'order', targetId: id,
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch(() => {})
      await OrderNotificationService.notifyOrderCancelled({ orderId: id }).catch(() => {})
      return successResponse(updated, '取消成功')
    }
  } catch (error) {
    logger.error('Admin update order error:', error)
    const message = error instanceof Error ? error.message : '操作失败'
    return errorResponse(message, 500)
  }
}
