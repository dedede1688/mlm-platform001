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

// 创建商品（管理员）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      imageUrl,
      retailPrice,
      memberPrice,
      stock,
      isUpgradeProduct,
      maxPointsRatio,
    } = body

    // 验证必填字段
    if (!name || !retailPrice || !memberPrice) {
      return NextResponse.json(
        { error: '商品名称和价格不能为空' },
        { status: 400 }
      )
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        imageUrl,
        retailPrice,
        memberPrice,
        stock: stock || 0,
        isUpgradeProduct: isUpgradeProduct || false,
        maxPointsRatio: maxPointsRatio || 50,
      },
    })

    return NextResponse.json({
      success: true,
      data: product,
    })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json(
      { error: '创建商品失败' },
      { status: 500 }
    )
  }
}
