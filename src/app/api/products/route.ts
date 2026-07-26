import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { ProductService } from '@/lib/services/product.service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const isUpgrade = searchParams.get('isUpgrade')

    const result = await ProductService.getAllProducts({
      page: 1,
      pageSize: 1000,
      status,
      isUpgrade,
    })

    return successResponse(result.products)
  } catch (error) {
    logger.error('Get products error:', error)
    return errorResponse('获取商品列表失败', 500)
  }
}
