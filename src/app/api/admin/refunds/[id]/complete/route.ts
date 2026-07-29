import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { invalidateCache } from '@/lib/utils/stats-cache'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/api-response'


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    invalidateCache('admin-stats')
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin', 'finance_admin'])
    if (authError || !admin) return authError!

    const refundRequest = await OrderLifecycleService.getRefundRequestById(id)
    if (!refundRequest) return errorResponse('退款申请不存在', 404)
    if (refundRequest.status !== 'approved') return errorResponse('退款状态不是已审批', 400)

    const updated = await OrderLifecycleService.completeApprovedRefund(id)

    try {
      await logOperation({
        userId: admin.id, action: 'COMPLETE_REFUND', module: 'refund', targetId: id,
        newValue: { status: 'completed' },
        ip: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      })
    } catch (logError) {
      logger.error('Admin complete refund operation log error:', logError)
    }

    if (refundRequest.order) {
      const { orderNo, userId, payAmount } = refundRequest.order
      try {
        await OrderNotificationService.notifyRefundCompleted({
          userId, orderId: refundRequest.orderId, orderNo, amount: payAmount || 0, operatorId: admin.id,
        })
      } catch (notificationError) {
        logger.error('Admin complete refund notification error:', notificationError)
      }
    }

    return successResponse(updated, '退款完成')
  } catch (error) {
    logger.error('Admin complete refund error:', error)
    const message = error instanceof Error ? error.message : ''
    if (
      message === '当前订单状态不允许退款'
      || message === '订单状态已变更，请刷新后重试'
      || message === '消费余额不足'
    ) {
      return errorResponse(message, 409)
    }
    if (message === '退款申请不存在') return errorResponse(message, 404)
    if (message === '退款状态不是已审批') return errorResponse(message, 400)
    return errorResponse('退款完成失败', 500)
  }
}
