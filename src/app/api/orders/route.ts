import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/lib/services/order.service'
import { verifyToken } from '@/lib/utils/auth'

// 获取订单列表
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined

    const orders = await OrderService.getUserOrders(user.userId, status)

    return NextResponse.json({
      success: true,
      data: orders,
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json(
      { error: '获取订单列表失败' },
      { status: 500 }
    )
  }
}

// 创建订单
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      )
    }

    const { items, pointsUsed } = await request.json()

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: '商品不能为空' },
        { status: 400 }
      )
    }

    // 一单一品一件校验：items长度只能为1，且quantity必须为1
    if (items.length > 1) {
      return NextResponse.json(
        { error: '每个订单只能购买一件商品' },
        { status: 400 }
      )
    }

    if (items[0].quantity !== 1) {
      return NextResponse.json(
        { error: '每个订单只能购买一件商品' },
        { status: 400 }
      )
    }

    const order = await OrderService.createOrder({
      userId: user.userId,
      items,
      pointsUsed,
    })

    return NextResponse.json({
      success: true,
      data: order,
    })
  } catch (error: any) {
    console.error('Create order error:', error)
    return NextResponse.json(
      { error: error.message || '创建订单失败' },
      { status: 500 }
    )
  }
}
