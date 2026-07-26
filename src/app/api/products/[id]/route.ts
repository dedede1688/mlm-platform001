import { NextRequest } from 'next/server'
import { ProductService } from '@/lib/services/product.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const product = await ProductService.getProductById(id)

    if (!product) {
      return errorResponse('商品不存在', 404)
    }

    return successResponse(product)
  } catch (error) {
    logger.error('Get product error:', error)
    return errorResponse('获取商品详情失败', 500)
  }
}
