import { NextRequest } from 'next/server'

import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { ProductService } from '@/lib/services/product.service'
import { z } from 'zod'
import { parseQuery } from '@/lib/validations/helper'

const productsQuerySchema = z.object({
  status: z.string().optional(),
  isUpgrade: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const qresult = parseQuery(productsQuerySchema, searchParams)
    const params = ('error' in qresult ? { status: 'active' } : qresult.data) as Record<string, string | undefined>
    const status = params.status || 'active'
    const isUpgrade = params.isUpgrade || undefined

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
