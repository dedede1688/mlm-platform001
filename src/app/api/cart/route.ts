import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

// GET /api/cart - 获取当前用户的购物车列表
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const cartItems = await prisma.cart.findMany({
      where: { userId: user.userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            retailPrice: true,
            memberPrice: true,
            stock: true,
            status: true,
            isUpgradeProduct: true,
            maxPointsRatio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: cartItems.map(item => ({
        id: item.id,
        quantity: item.quantity,
        createdAt: item.createdAt,
        product: item.product,
      })),
    })
  } catch (error) {
    console.error('获取购物车失败:', error)
    return NextResponse.json({ error: '获取购物车失败' }, { status: 500 })
  }
}

// POST /api/cart - 添加商品到购物车
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return NextResponse.json({ error: '商品ID不能为空' }, { status: 400 })
    }

    // 验证商品是否存在且可购买
    const product = await prisma.product.findUnique({
      where: { id: productId },
    })

    if (!product) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 })
    }

    if (product.status !== 'active') {
      return NextResponse.json({ error: '商品已下架' }, { status: 400 })
    }

    if (product.stock <= 0) {
      return NextResponse.json({ error: '商品库存不足' }, { status: 400 })
    }

    // 检查是否已在购物车中（一单一品一件规则）
    const existing = await prisma.cart.findUnique({
      where: {
        userId_productId: {
          userId: user.userId,
          productId,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: '该商品已在购物车中，每个商品只能添加一次' },
        { status: 409 }
      )
    }

    const cartItem = await prisma.cart.create({
      data: {
        userId: user.userId,
        productId,
        quantity: 1,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            retailPrice: true,
            memberPrice: true,
            stock: true,
            status: true,
            isUpgradeProduct: true,
            maxPointsRatio: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: cartItem.id,
        quantity: cartItem.quantity,
        createdAt: cartItem.createdAt,
        product: cartItem.product,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('添加购物车失败:', error)
    return NextResponse.json({ error: '添加购物车失败' }, { status: 500 })
  }
}