import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { ProductService } from '@/lib/services/product.service'

// POST /api/admin/products/[id]/duplicate —— 复制商品
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params

    const newProduct = await ProductService.duplicateProduct(id)

    if (!newProduct) {
      return errorResponse('商品不存在', 404)
    }

    // 记录操作日志
    await logOperation({
      userId: admin.id,
      action: 'CREATE',
      module: 'product',
      targetId: newProduct.id,
      newValue: { name: newProduct.name, originalId: id },
    })

    return successResponse({ id: newProduct.id, name: newProduct.name }, '商品复制成功')
  } catch (error) {
    logger.error('复制商品失败:', error)
    return errorResponse('复制商品失败', 500)
  }
}
