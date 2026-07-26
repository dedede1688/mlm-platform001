import { NextRequest, NextResponse } from 'next/server'
import { ProductService } from '@/lib/services/product.service'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const product = await ProductService.getProductById(id)

    if (!product) {
      return NextResponse.json(
        { error: '商品不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: product,
    })
  } catch (error) {
    logger.error('Get product error:', error)
    return NextResponse.json(
      { error: '获取商品详情失败' },
      { status: 500 }
    )
  }
}
