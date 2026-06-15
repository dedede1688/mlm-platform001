import { prisma } from '@/lib/prisma'
import { RewardService } from './reward.service'
import { ORDER_STATUS } from '@/lib/constants'
import { sendEmail } from '@/lib/notification/sendEmail'
import { sendSms } from '@/lib/notification/sendSms'
import { logger } from '@/lib/logger'

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
        const result = await tx.$queryRawUnsafe<{ count: number }[]>(`
          UPDATE "products"
          SET stock = stock - ${item.quantity}
          WHERE id = '${item.productId.replace(/'/g, "''")}' AND stock >= ${item.quantity}
          RETURNING 1 as count
        `)
        if (result.length === 0) {
          throw new Error(`商品 ${item.productId} 库存不足，请刷新页面重试`)
        }
      }

      // 如果使用积分，原子扣减积分（防并发透支）
      if (actualPointsUsed > 0) {
        const result = await tx.$queryRawUnsafe<{ count: number }[]>(`
          UPDATE "users"
          SET "unlocked_points" = "unlocked_points" - ${actualPointsUsed}
          WHERE id = '${userId.replace(/'/g, "''")}'::uuid AND "unlocked_points" >= ${actualPointsUsed}
          RETURNING 1 as count
        `)
        if (result.length === 0) {
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

  // 支付订单（模拟支付）
  static async payOrder(orderId: string) {
    // 使用原子更新防并发：仅当状态为 pending 时才更新
    const order = await prisma.order.updateMany({
      where: { id: orderId, status: ORDER_STATUS.PENDING },
      data: {
        status: ORDER_STATUS.PAID,
        paidAt: new Date(),
      },
    })

    if (order.count === 0) {
      throw new Error('订单不存在或状态已变更')
    }

    // 重新查询完整订单数据
    const paidOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: { product: true },
        },
      },
    })

    if (!paidOrder) throw new Error('订单不存在')

    // 处理奖励
    await RewardService.processOrderRewards(orderId)

    // 预留：发送订单支付成功通知
    const userEmail = paidOrder.user.email
    const userPhone = paidOrder.user.phone
    const notifyVars = {
      orderNo: paidOrder.orderNo,
      orderAmount: paidOrder.totalAmount.toFixed(2),
      payAmount: paidOrder.payAmount.toFixed(2),
      userName: paidOrder.user.nickname ?? paidOrder.user.phone,
    }
    if (userEmail) {
      sendEmail({ to: userEmail, templateType: 'order_paid', variables: notifyVars }).catch((err) => {
        logger.error('发送订单支付成功邮件失败', { error: err instanceof Error ? err.message : String(err) })
      })
    }
    if (userPhone) {
      sendSms({ to: userPhone, templateType: 'order_paid', variables: notifyVars }).catch((err) => {
        logger.error('发送订单支付成功短信失败', { error: err instanceof Error ? err.message : String(err) })
      })
    }

    return paidOrder
  }

  // 发货
  static async shipOrder(orderId: string, _trackingNo?: string) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.SHIPPED,
        shippedAt: new Date(),
      },
      include: { user: true },
    })

    // 预留：发送订单发货通知
    const userEmail = order.user.email
    const userPhone = order.user.phone
    const notifyVars = {
      orderNo: order.orderNo,
      trackingNumber: order.trackingNumber ?? '',
      userName: order.user.nickname ?? order.user.phone,
    }
    if (userEmail) {
      sendEmail({ to: userEmail, templateType: 'order_shipped', variables: notifyVars }).catch((err) => {
        logger.error('发送订单发货邮件失败', { error: err instanceof Error ? err.message : String(err) })
      })
    }
    if (userPhone) {
      sendSms({ to: userPhone, templateType: 'order_shipped', variables: notifyVars }).catch((err) => {
        logger.error('发送订单发货短信失败', { error: err instanceof Error ? err.message : String(err) })
      })
    }

    return order
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

    // 使用事务保证原子性
    await prisma.$transaction(async (tx) => {
      // 退回库存
      for (const item of order.items) {
        await tx.product.update({
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
        const user = await tx.user.findUnique({ where: { id: order.userId } })
        if (user) {
          await tx.user.update({
            where: { id: order.userId },
            data: {
              unlockedPoints: {
                increment: order.pointsUsed,
              },
            },
          })

          await tx.pointsRecord.create({
            data: {
              userId: order.userId,
              type: 'earn',
              amount: order.pointsUsed,
              totalPoints: user.totalPoints,
              unlockedPoints: user.unlockedPoints + order.pointsUsed,
              lockedPoints: user.lockedPoints,
              sourceId: order.id,
              description: `订单 ${order.orderNo} 退款积分退回`,
            },
          })
        }
      }

      // 扣除已发放的奖励
      await RewardService.processRefund(orderId)

      // 更新订单状态
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: ORDER_STATUS.REFUNDED,
        },
      })
    })

    return prisma.order.findUnique({ where: { id: orderId } })
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

    // 使用事务保证原子性
    await prisma.$transaction(async (tx) => {
      // 退回库存
      for (const item of order.items) {
        await tx.product.update({
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
        const user = await tx.user.findUnique({ where: { id: order.userId } })
        if (user) {
          await tx.user.update({
            where: { id: order.userId },
            data: {
              unlockedPoints: {
                increment: order.pointsUsed,
              },
            },
          })

          // 创建积分退回记录
          await tx.pointsRecord.create({
            data: {
              userId: order.userId,
              type: 'earn',
              amount: order.pointsUsed,
              totalPoints: user.totalPoints,
              unlockedPoints: user.unlockedPoints + order.pointsUsed,
              lockedPoints: user.lockedPoints,
              sourceId: order.id,
              description: `订单 ${order.orderNo} 取消积分退回`,
            },
          })
        }
      }

      // 更新订单状态
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: ORDER_STATUS.CANCELLED,
        },
      })
    })

    return prisma.order.findUnique({ where: { id: orderId } })
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