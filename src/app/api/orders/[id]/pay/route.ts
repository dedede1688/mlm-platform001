import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { OrderService } from '@/lib/services/order.service'
import { RewardService } from '@/lib/services/reward.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // 验证用户登录
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
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
      return NextResponse.json(
        { error: '订单不存在' },
        { status: 404 }
      )
    }

    // 验证订单归属
    if (order.userId !== user.userId) {
      return NextResponse.json(
        { error: '无权操作' },
        { status: 403 }
      )
    }

    // 检查订单状态
    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: '订单状态不允许支付' },
        { status: 400 }
      )
    }

    // 执行支付操作
    const updatedOrder = await OrderService.payOrder(id)

    // 处理奖励发放和升级检查
    await RewardService.processOrderRewards(id)

    return NextResponse.json({
      success: true,
      data: updatedOrder,
      message: '支付成功'
    })

  } catch (error: any) {
    console.error('Pay order error:', error)
    return NextResponse.json(
      { error: error.message || '支付失败' },
      { status: 500 }
    )
  }
}