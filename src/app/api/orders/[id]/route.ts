import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/lib/services/order.service'
import { verifyToken } from '@/lib/utils/auth'

// 获取订单详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const order = await OrderService.getOrderDetail(id)

    if (!order) {
      return NextResponse.json(
        { error: '订单不存在' },
        { status: 404 }
      )
    }

    // 检查权限
    if (order.userId !== user.userId && !['super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor'].includes(user.role || '')) {
      return NextResponse.json(
        { error: '无权查看' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: order,
    })
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json(
      { error: '获取订单详情失败' },
      { status: 500 }
    )
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
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { password } = body as { password: string }

    if (!password) {
      return NextResponse.json(
        { success: false, error: '请输入支付密码' },
        { status: 400 }
      )
    }

    // 业务逻辑全部走Service
    const updatedOrder = await OrderService.verifyPayment(orderId, password)

    return NextResponse.json({
      success: true,
      data: updatedOrder,
      message: '支付成功',
    })
  } catch (error: any) {
    console.error('Pay order error:', error)
    const msg = error.message || '支付失败'
    const status = msg === '支付密码错误' ? 401 : 500
    return NextResponse.json(
      { success: false, error: msg },
      { status }
    )
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
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const order = await OrderService.getOrderDetail(id)

    if (!order) {
      return NextResponse.json(
        { error: '订单不存在' },
        { status: 404 }
      )
    }

    if (order.userId !== user.userId) {
      return NextResponse.json(
        { error: '无权操作' },
        { status: 403 }
      )
    }

    const updatedOrder = await OrderService.completeOrder(id)

    return NextResponse.json({
      success: true,
      data: updatedOrder,
    })
  } catch (error: any) {
    console.error('Complete order error:', error)
    return NextResponse.json(
      { error: '确认收货失败' },
      { status: 500 }
    )
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
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const order = await OrderService.getOrderDetail(id)

    if (!order) {
      return NextResponse.json(
        { error: '订单不存在' },
        { status: 404 }
      )
    }

    if (order.userId !== user.userId) {
      return NextResponse.json(
        { error: '无权操作' },
        { status: 403 }
      )
    }

    await OrderService.cancelOrder(id)

    return NextResponse.json({
      success: true,
      message: '订单已取消',
    })
  } catch (error: any) {
    console.error('Cancel order error:', error)
    return NextResponse.json(
      { error: '取消订单失败' },
      { status: 500 }
    )
  }
}