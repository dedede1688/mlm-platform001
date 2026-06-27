import { prisma } from '@/lib/prisma'
import { ORDER_STATUS } from '@/lib/constants'

/**
 * v50 N-2: 订单 service（拆分完成）
 *
 * 保留方法（3 个）：
 * - createOrder（订单创建）
 * - getUserOrders / getOrderDetail（订单查询）
 *
 * 拆出的方法（13 个）：
 * - order-lifecycle.service.ts（7 个状态机方法）
 * - order-notification.service.ts（6 个通知方法）
 *
 * 三方职责清晰：
 * - OrderService：订单 CRUD
 * - OrderLifecycleService：状态机（支付/履约/退款/取消）
 * - OrderNotificationService：站内信/邮件/短信
 */
export class OrderService {
  // 创建订单（一单一品一件）
  static async createOrder(data: {
    userId: string
    items: { productId: string; quantity: number }[]
    pointsUsed?: number
    recipientName?: string | null   // v43-4: 收货人姓名
    recipientPhone?: string | null  // v43-4: 收货人电话
    shippingAddress?: string | null // v43-4: 收货地址
  }) {
    const { userId, items, pointsUsed = 0, recipientName, recipientPhone, shippingAddress } = data

    // 一单一品一件校验
    if (items.length !== 1) {
      throw new Error('每个订单只能购买一件商品')
    }
    if (items[0].quantity !== 1) {
      throw new Error('每个订单只能购买一件商品')
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) throw new Error('用户不存在')

    // 获取商品信息
    const productIds = items.map(item => item.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    })

    // 计算订单金额
    let totalAmount = 0
    const orderItems: Array<{ productId: string; quantity: number; unitPrice: number; totalPrice: number }> = []

    for (const item of items) {
      const product = products.find(p => p.id === item.productId)
      if (!product) throw new Error(`商品 ${item.productId} 不存在`)
      if (product.stock < item.quantity) {
        throw new Error(`商品 ${product.name} 库存不足`)
      }

      // 根据用户等级确定价格
      const unitPrice = user.level >= 1 ? product.memberPrice : product.retailPrice
      const totalPrice = unitPrice * item.quantity

      totalAmount = totalAmount + totalPrice
      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      })
    }

    // 计算积分抵扣
    let pointsDiscount = 0
    const maxPoints = user.unlockedPoints
    const actualPointsUsed = Math.min(pointsUsed || 0, maxPoints)

    if (actualPointsUsed > 0) {
      // 获取商品的最大抵扣比例
      const product = products[0] // 一单一品一件
      const maxPointsRatio = product.maxPointsRatio || 50 // 默认50%
      const maxPointsDiscount = totalAmount * (maxPointsRatio / 100)
      pointsDiscount = Math.min(actualPointsUsed, maxPointsDiscount)
    }

    const payAmount = totalAmount - pointsDiscount

    // 生成订单号
    const orderNo = `ORD${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`

    // 使用事务保证原子性：创建订单 + 扣减库存 + 扣减积分
    const order = await prisma.$transaction(async (tx) => {
      // 事务内重新检查库存（防并发超卖）
      const freshProducts = await tx.product.findMany({
        where: { id: { in: productIds } },
      })
      for (const item of items) {
        const freshProduct = freshProducts.find(p => p.id === item.productId)
        if (!freshProduct) throw new Error(`商品 ${item.productId} 不存在`)
        if (freshProduct.stock < item.quantity) {
          throw new Error(`商品 ${freshProduct.name} 库存不足`)
        }
      }

      // 事务内重新检查积分余额（防并发透支）
      const freshUser = await tx.user.findUnique({ where: { id: userId } })
      if (!freshUser) throw new Error('用户不存在')
      if (actualPointsUsed > 0 && freshUser.unlockedPoints < actualPointsUsed) {
        throw new Error('可用积分不足')
      }

      // 创建订单
      const createdOrder = await tx.order.create({
        data: {
          userId,
          orderNo,
          totalAmount,
          pointsUsed: actualPointsUsed,
          pointsDiscount,
          payAmount,
          status: ORDER_STATUS.PENDING,
          recipientName: recipientName || null,     // v43-4
          recipientPhone: recipientPhone || null,    // v43-4
          shippingAddress: shippingAddress || null,  // v43-4
          items: {
            create: orderItems,
          },
        },
        include: {
          items: true,
        },
      })

      // 原子扣减库存（防并发超卖）
      for (const item of items) {
        const result = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        })
        if (result.count === 0) {
          throw new Error(`商品 ${item.productId} 库存不足，请刷新页面重试`)
        }
      }

      // 如果使用积分，原子扣减积分（防并发透支）
      if (actualPointsUsed > 0) {
        const result = await tx.user.updateMany({
          where: {
            id: userId,
            unlockedPoints: { gte: actualPointsUsed },
          },
          data: {
            unlockedPoints: { decrement: actualPointsUsed },
          },
        })
        if (result.count === 0) {
          throw new Error('可用积分不足，请刷新页面重试')
        }

        await tx.pointsRecord.create({
          data: {
            userId,
            type: 'use',
            amount: -actualPointsUsed,
            totalPoints: freshUser.totalPoints,
            unlockedPoints: freshUser.unlockedPoints - actualPointsUsed,
            lockedPoints: freshUser.lockedPoints,
            sourceId: createdOrder.id,
            description: `订单 ${orderNo} 积分抵扣`,
          },
        })
      }

      return createdOrder
    })

    return order
  }

  // 获取用户的订单列表
  static async getUserOrders(userId: string, status?: string, page: number = 1, limit: number = 20) {
    const where: Record<string, unknown> = { userId }
    if (status) where.status = status

    const skip = (page - 1) * limit

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  // 获取订单详情
  static async getOrderDetail(orderId: string) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: { product: true },
        },
        rewards: true,
        refundRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  }
}
