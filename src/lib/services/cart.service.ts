import { prisma } from '@/lib/prisma'
import { ProductService } from './product.service'

export class CartService {
  /**
   * D-6.2: 获取用户购物车列表
   * 原路由: src/app/api/cart/route.ts (GET)
   */
  static async getItems(userId: string) {
    const cartItems = await prisma.cart.findMany({
      where: { userId },
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

    return cartItems.map(item => ({
      id: item.id,
      quantity: item.quantity,
      createdAt: item.createdAt,
      product: item.product,
    }))
  }

  /**
   * D-6.2: 添加商品到购物车（含校验：商品存在/上架/有库存/不重复）
   * 原路由: src/app/api/cart/route.ts (POST)
   * 返回 cartItem 或抛出错误信息 { error, status }
   */
  static async addItem(userId: string, productId: string) {
    // 验证商品是否存在且可购买
    const product = await ProductService.getProductById(productId)
    if (!product) {
      throw Object.assign(new Error('商品不存在'), { statusCode: 404 })
    }
    if (product.status !== 'active') {
      throw Object.assign(new Error('商品已下架'), { statusCode: 400 })
    }
    if (product.stock <= 0) {
      throw Object.assign(new Error('商品库存不足'), { statusCode: 400 })
    }

    // 检查是否已在购物车中（一单一品一件规则）
    const existing = await prisma.cart.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    })
    if (existing) {
      throw Object.assign(new Error('该商品已在购物车中，每个商品只能添加一次'), { statusCode: 409 })
    }

    const cartItem = await prisma.cart.create({
      data: { userId, productId, quantity: 1 },
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

    return {
      id: cartItem.id,
      quantity: cartItem.quantity,
      createdAt: cartItem.createdAt,
      product: cartItem.product,
    }
  }

  /**
   * D-6.4: 删除购物车项（验证所有权）
   */
  static async deleteItem(userId: string, id: string) {
    const cartItem = await prisma.cart.findUnique({ where: { id } })
    if (!cartItem) {
      throw Object.assign(new Error('购物车项不存在'), { statusCode: 404 })
    }
    if (cartItem.userId !== userId) {
      throw Object.assign(new Error('无权操作'), { statusCode: 403 })
    }
    await prisma.cart.delete({ where: { id } })
  }

}
