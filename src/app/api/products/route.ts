import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 获取商品列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const isUpgrade = searchParams.get('isUpgrade')

    const where: any = { status }
    if (isUpgrade !== null) {
      where.isUpgradeProduct = isUpgrade === 'true'
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: products,
    })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json(
      { error: '获取商品列表失败' },
      { status: 500 }
    )
  }
}
