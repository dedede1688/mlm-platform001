import { NextRequest } from "next/server"
import { OrderService } from "@/lib/services/order.service"
import { OrderLifecycleService } from "@/lib/services/order-lifecycle.service"
import { verifyToken } from "@/lib/utils/auth"

import { errorResponse, successResponse } from "@/lib/api-response"
import { AppErrorCode } from "@/lib/utils/error-codes"
import { logger } from "@/lib/logger"


// 获取订单详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const order = await OrderService.getOrderDetail(id)

    if (!order) {
      return errorResponse("订单不存在", 404, { code: AppErrorCode.NOT_FOUND })
    }

    // 检查权限
    if (order.userId !== user.userId && !['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor'].includes(user.role || '')) {
      return errorResponse("无权查看", 403, { code: AppErrorCode.FORBIDDEN })
    }

    const publicOrder = {
      id: order.id,
      orderNo: order.orderNo,
      totalAmount: order.totalAmount,
      pointsUsed: order.pointsUsed,
      pointsDiscount: order.pointsDiscount,
      payAmount: order.payAmount,
      status: order.status,
      trackingNumber: order.trackingNumber,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      shippingAddress: order.shippingAddress,
      paymentVerified: order.paymentVerified,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        product: {
          id: item.product.id,
          name: item.product.name,
          imageUrl: item.product.imageUrl,
        },
      })),
      refundRequests: order.refundRequests.map((refund) => ({
        id: refund.id,
        reason: refund.reason,
        description: refund.description,
        images: refund.images,
        status: refund.status,
        adminComment: refund.adminComment,
        createdAt: refund.createdAt,
      })),
    }

    return successResponse(publicOrder)
  } catch (error) {
    logger.error("Get order error:", error)
    return errorResponse("获取订单详情失败", 500, { code: AppErrorCode.INTERNAL_ERROR })
  }
}

// 支付订单（v50.1-K：强制支付密码校验，路由层只做校验+调Service）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orderId = (await params).id
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const body = await request.json()
    const { password } = body as { password: string }

    if (!password) {
      return errorResponse("请输入支付密码", 400, { code: AppErrorCode.PAYMENT_PASSWORD_REQUIRED })
    }

    // 业务逻辑全部走Service
    const updatedOrder = await OrderLifecycleService.verifyPayment(orderId, user.userId, password)

    return successResponse(updatedOrder, "支付成功")
  } catch (error: unknown) {
    logger.error("Pay order error:", error)
    const msg = error instanceof Error ? error.message : "支付失败"
    const status = msg === "支付密码错误" ? 401 : 500
    return errorResponse(msg, status, msg === "支付密码错误" ? { code: AppErrorCode.PAYMENT_PASSWORD_WRONG } : { code: AppErrorCode.INTERNAL_ERROR })
  }
}

// 确认收货
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const order = await OrderService.getOrderDetail(id)

    if (!order) {
      return errorResponse("订单不存在", 404, { code: AppErrorCode.NOT_FOUND })
    }

    if (order.userId !== user.userId) {
      return errorResponse("无权操作", 403, { code: AppErrorCode.FORBIDDEN })
    }

    const updatedOrder = await OrderLifecycleService.completeOrder(id)

    return successResponse(updatedOrder)
  } catch (error: unknown) {
    logger.error("Complete order error:", error)
    const message = error instanceof Error ? error.message : "确认收货失败"
    if (message === "订单存在进行中的退款申请，不能完成") {
      return errorResponse(message, 409)
    }
    return errorResponse("确认收货失败", 500, { code: AppErrorCode.INTERNAL_ERROR })
  }
}

// 取消订单
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const order = await OrderService.getOrderDetail(id)

    if (!order) {
      return errorResponse("订单不存在", 404, { code: AppErrorCode.NOT_FOUND })
    }

    if (order.userId !== user.userId) {
      return errorResponse("无权操作", 403, { code: AppErrorCode.FORBIDDEN })
    }

    await OrderLifecycleService.cancelOrder(id)

    return successResponse(null, "订单已取消")
  } catch (error: unknown) {
    logger.error("Cancel order error:", error)
    return errorResponse("取消订单失败", 500, { code: AppErrorCode.INTERNAL_ERROR })
  }
}
