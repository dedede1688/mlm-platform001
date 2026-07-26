import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
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
      return NextResponse.json(
        { success: false, message: '商品不存在' },
        { status: 404 }
      )
    }

    // 记录操作日志
    await logOperation({
      userId: admin.id,
      action: 'CREATE',
      module: 'product',
      targetId: newProduct.id,
      newValue: { name: newProduct.name, originalId: id },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: newProduct.id,
        name: newProduct.name,
        message: '商品复制成功',
      },
    })
  } catch (error) {
    logger.error('复制商品失败:', error)
    return NextResponse.json(
      { success: false, message: '复制商品失败' },
      { status: 500 }
    )
  }
}
