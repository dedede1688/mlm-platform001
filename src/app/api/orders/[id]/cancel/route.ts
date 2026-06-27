import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { OrderService } from '@/lib/services/order.service'
import { OrderLifecycleService } from '@/lib/services/order-lifecycle.service'

// POST /api/orders/[id]/cancel — 取消订单（待支付状态）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orderId = (await params).id

  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    // 查订单做归属和状态校验
    const order = await OrderService.getOrderDetail(orderId)

    if (!order) {
      return errorResponse('订单不存在', 404)
    }

    if (order.userId !== user.userId) {
      return errorResponse('无权操作此订单', 403)
    }

    // 已支付/已发货等不允许取消
    if (order.status !== 'pending') {
      return errorResponse('只能取消待支付的订单', 400)
    }

    // 调用 Service 层取消（含事务：退库存 + 退积分 + 更新状态）
    const cancelledOrder = await OrderLifecycleService.cancelOrder(orderId)

    return successResponse(cancelledOrder, '订单已取消')
  } catch (error: any) {
    console.error('取消订单失败:', error)
    return errorResponse(error.message || '取消订单失败', 500)
  }
}
