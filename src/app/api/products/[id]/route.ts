import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 获取商品详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({
      where: { id },
    })

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
    console.error('Get product error:', error)
    return NextResponse.json(
      { error: '获取商品详情失败' },
      { status: 500 }
    )
  }
}

// 更新商品（用户端）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
      benefits,
      specs,
      status,
    } = body

    // 检查商品是否存在
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, message: '商品不存在' },
        { status: 404 }
      )
    }

    // 构建更新数据
    const data: Record<string, unknown> = {}

    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description || null
    if (imageUrl !== undefined) data.imageUrl = imageUrl || null
    if (retailPrice !== undefined) data.retailPrice = Number(retailPrice)
    if (memberPrice !== undefined) data.memberPrice = Number(memberPrice)
    if (stock !== undefined) data.stock = Number(stock)
    if (isUpgradeProduct !== undefined) data.isUpgradeProduct = isUpgradeProduct === true
    if (maxPointsRatio !== undefined) {
      // 升级产品强制为0，普通产品最高不超过50
      data.maxPointsRatio = existing.isUpgradeProduct ? 0 : Math.min(50, Number(maxPointsRatio))
    }
    if (benefits !== undefined) data.benefits = benefits && Array.isArray(benefits) && benefits.length > 0 ? benefits : null
    if (specs !== undefined) data.specs = specs && Array.isArray(specs) && specs.length > 0 ? specs : null
    if (status !== undefined) data.status = status

    const product = await prisma.product.update({
      where: { id },
      data,
    })

    return NextResponse.json({
      success: true,
      data: product,
    })
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json(
      { error: '更新商品失败' },
      { status: 500 }
    )
  }
}

// 删除商品
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.product.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '商品已删除',
    })
  } catch (error) {
    console.error('Delete product error:', error)
    return NextResponse.json(
      { error: '删除商品失败' },
      { status: 500 }
    )
  }
}
