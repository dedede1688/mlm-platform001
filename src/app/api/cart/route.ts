import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { logger } from '@/lib/logger'
import { CartService } from '@/lib/services/cart.service'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const data = await CartService.getItems(user.userId)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    logger.error('获取购物车失败', error)
    return NextResponse.json({ error: '获取购物车失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return NextResponse.json({ error: '商品ID不能为空' }, { status: 400 })
    }

    const cartItem = await CartService.addItem(user.userId, productId)

    return NextResponse.json({ success: true, data: cartItem }, { status: 201 })
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('添加购物车失败', error)
    return NextResponse.json({ error: '添加购物车失败' }, { status: 500 })
  }
}
