import { NextRequest, NextResponse } from 'next/server'
console.warn('[DEPRECATED] /api/orders/[id]/pay 已废弃，请用 /api/orders/[id]/verify-payment')
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { OrderService } from '@/lib/services/order.service'
import { errorResponse } from '@/lib/api-response'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // 验证用户登录
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    // 获取订单信息
    const order = await prisma.order.findUnique({
      where: { id },
      include: { 
        user: true,
        items: {
          include: { product: true }
        }
      }
    })

    if (!order) {
      return errorResponse('订单不存在', 404)
    }

    // 验证订单归属
    if (order.userId !== user.userId) {
      return errorResponse('无权操作', 403)
    }

    // 检查订单状态
    if (order.status !== 'pending') {
      return errorResponse('订单状态不允许支付', 400)
    }

    // 执行支付操作（内部已包含奖励发放）
    const updatedOrder = await OrderService.payOrder(id)

    return NextResponse.json({
      success: true,
      data: updatedOrder,
      message: '支付成功'
    })

  } catch (error: any) {
    console.error('Pay order error:', error)
    return errorResponse('支付失败', 500)
  }
}