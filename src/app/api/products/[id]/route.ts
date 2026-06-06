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

// 更新商品
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
      status,
    } = body

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        description,
        imageUrl,
        retailPrice,
        memberPrice,
        stock,
        isUpgradeProduct,
        maxPointsRatio,
        status,
      },
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