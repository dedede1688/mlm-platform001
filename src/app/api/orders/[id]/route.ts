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
    if (order.userId !== user.userId && user.role !== 'admin') {
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

// 支付订单
export async function POST(
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

    const updatedOrder = await OrderService.payOrder(id)

    return NextResponse.json({
      success: true,
      data: updatedOrder,
    })
  } catch (error: any) {
    console.error('Pay order error:', error)
    return NextResponse.json(
      { error: '支付失败' },
      { status: 500 }
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