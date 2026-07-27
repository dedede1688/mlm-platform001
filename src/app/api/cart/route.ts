import { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { CartService } from '@/lib/services/cart.service'
import { z } from 'zod'
import { parseBody } from '@/lib/validations/helper'

const addCartSchema = z.object({
  productId: z.string().min(1, '??ID????'),
})

export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('请先登录', 401)
    }

    const data = await CartService.getItems(user.userId)

    return successResponse(data)
  } catch (error) {
    logger.error('获取购物车失败', error)
    return errorResponse('获取购物车失败', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('请先登录', 401)
    }

    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return errorResponse('商品ID不能为空', 400)
    }

    const cartItem = await CartService.addItem(user.userId, productId)

    return successResponse(cartItem)
  } catch (error: any) {
    if (error?.statusCode) {
      return errorResponse(error.message, error.statusCode)
    }
    logger.error('添加购物车失败', error)
    return errorResponse('添加购物车失败', 500)
  }
}
