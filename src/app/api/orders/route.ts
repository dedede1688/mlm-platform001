import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/lib/services/order.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse } from '@/lib/api-response'

// 获取订单列表
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const result = await OrderService.getUserOrders(user.userId, status, page, limit)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return errorResponse('获取订单列表失败', 500)
  }
}

// 创建订单
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const { items, pointsUsed, recipientName, recipientPhone, shippingAddress } = await request.json()

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse('商品不能为空', 400)
    }

    // 一单一品一件校验：items长度只能为1，且quantity必须为1
    if (items.length > 1) {
      return errorResponse('每个订单只能购买一件商品', 400)
    }

    if (items[0].quantity !== 1) {
      return errorResponse('每个订单只能购买一件商品', 400)
    }

    // v43-4: 收货信息校验
    if (!recipientName || !recipientPhone || !shippingAddress) {
      return errorResponse('请填写完整的收货信息', 400)
    }

    const order = await OrderService.createOrder({
      userId: user.userId,
      items,
      pointsUsed,
      recipientName,
      recipientPhone,
      shippingAddress,
    })

    return NextResponse.json({
      success: true,
      data: order,
    })
  } catch (error: any) {
    console.error('Create order error:', error)
    return errorResponse('创建订单失败', 500)
  }
}
