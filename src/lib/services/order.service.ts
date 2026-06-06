import { prisma } from '@/lib/prisma'
import { RewardService } from './reward.service'
import { ORDER_STATUS } from '@/lib/constants'

export class OrderService {
  // 创建订单（一单一品一件）
  static async createOrder(data: {
    userId: string
    items: { productId: string; quantity: number }[]
    pointsUsed?: number
  }) {
    const { userId, items, pointsUsed = 0 } = data

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
    const orderItems = []

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

    // 创建订单
    const order = await prisma.order.create({
      data: {
        userId,
        orderNo,
        totalAmount,
        pointsUsed: actualPointsUsed,
        pointsDiscount,
        payAmount,
        status: ORDER_STATUS.PENDING,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: true,
      },
    })

    // 扣减库存
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      })
    }

    // 如果使用积分，扣减积分
    if (actualPointsUsed > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          unlockedPoints: {
            decrement: actualPointsUsed,
          },
        },
      })

      await prisma.pointsRecord.create({
        data: {
          userId,
          type: 'use',
          amount: -actualPointsUsed,
          totalPoints: user.totalPoints,
          unlockedPoints: user.unlockedPoints - actualPointsUsed,
          lockedPoints: user.lockedPoints,
          sourceId: order.id,
          description: `订单 ${orderNo} 积分抵扣`,
        },
      })
    }

    return order
  }

  // 支付订单（模拟支付）
  static async payOrder(orderId: string) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.PAID,
        paidAt: new Date(),
      },
      include: {
        user: true,
        items: {
          include: { product: true },
        },
      },
    })

    // 处理奖励
    await RewardService.processOrderRewards(orderId)

    return order
  }

  // 发货
  static async shipOrder(orderId: string, _trackingNo?: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.SHIPPED,
        shippedAt: new Date(),
      },
    })
  }

  // 确认收货
  static async completeOrder(orderId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.COMPLETED,
        completedAt: new Date(),
      },
    })
  }

  // 自动确认收货（7天后）
  static async autoCompleteOrders() {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const orders = await prisma.order.findMany({
      where: {
        status: ORDER_STATUS.SHIPPED,
        shippedAt: {
          lte: sevenDaysAgo,
        },
      },
    })

    for (const order of orders) {
      await this.completeOrder(order.id)
    }

    return orders.length
  }

  // 申请退款
  static async requestRefund(orderId: string, _reason?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })

    if (!order) throw new Error('订单不存在')
    if (order.status !== ORDER_STATUS.PAID && order.status !== ORDER_STATUS.SHIPPED) {
      throw new Error('订单状态不允许退款')
    }

    // 退回库存
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            increment: item.quantity,
          },
        },
      })
    }

    // 如果使用了积分，退回积分
    if (order.pointsUsed > 0) {
      await prisma.user.update({
        where: { id: order.userId },
        data: {
          unlockedPoints: {
            increment: order.pointsUsed,
          },
        },
      })

      await prisma.pointsRecord.create({
        data: {
          userId: order.userId,
          type: 'earn',
          amount: order.pointsUsed,
          totalPoints: 0,
          unlockedPoints: 0,
          lockedPoints: 0,
          sourceId: order.id,
          description: `订单 ${order.orderNo} 退款积分退回`,
        },
      })
    }

    // 扣除已发放的奖励
    await RewardService.processRefund(orderId)

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.REFUNDED,
      },
    })
  }

  // 取消订单
  static async cancelOrder(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })

    if (!order) throw new Error('订单不存在')
    if (order.status !== ORDER_STATUS.PENDING) {
      throw new Error('订单状态不允许取消')
    }

    // 退回库存
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            increment: item.quantity,
          },
        },
      })
    }

    // 如果使用了积分，退回积分
    if (order.pointsUsed > 0) {
      await prisma.user.update({
        where: { id: order.userId },
        data: {
          unlockedPoints: {
            increment: order.pointsUsed,
          },
        },
      })
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.CANCELLED,
      },
    })
  }

  // 获取用户的订单列表
  static async getUserOrders(userId: string, status?: string) {
    const where: Record<string, unknown> = { userId }
    if (status) where.status = status

    return prisma.order.findMany({
      where,
      include: {
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
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
      },
    })
  }
}