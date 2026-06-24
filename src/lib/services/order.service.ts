import { prisma } from '@/lib/prisma'
import { RewardService } from './reward.service'
import { ORDER_STATUS } from '@/lib/constants'
import { sendEmail } from '@/lib/notification/sendEmail'
import { sendSms } from '@/lib/notification/sendSms'
import { sendInApp } from '@/lib/notification/sendInApp'
import { logger } from '@/lib/logger'

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

  
  // 支付订单（v43-6 Batch 3：事务 + paymentVerified + 余额扣减 + balance_record）
  static async payOrder(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new Error('订单不存在')
    if (order.status !== ORDER_STATUS.PENDING) throw new Error('订单不存在或状态已变更')
    const paidOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({ where: { id: orderId, status: ORDER_STATUS.PENDING }, data: { status: ORDER_STATUS.PAID, paymentVerified: true, paidAt: new Date() } })
      if (updated.count === 0) throw new Error('订单不存在或状态已变更')
      if (order.payAmount > 0) {
        const freshUser = await tx.user.findUnique({ where: { id: order.userId }, select: { balance: true, frozenBalance: true } })
        if (!freshUser) throw new Error('用户不存在')
        const bu = await tx.user.updateMany({ where: { id: order.userId, balance: { gte: order.payAmount } }, data: { balance: { decrement: order.payAmount }, consumeBalance: { increment: order.payAmount } } })
        if (bu.count === 0) throw new Error('可用余额不足')
        const nb = freshUser.balance - order.payAmount
        await tx.balanceRecord.create({ data: { userId: order.userId, type: 'payment', amount: -order.payAmount, balance: nb, frozenBalance: freshUser.frozenBalance, sourceType: 'order', sourceId: orderId, description: '订单 ' + order.orderNo + ' 支付' } })
      }
      return await tx.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } })
    })
    if (!paidOrder) throw new Error('订单不存在')
    await RewardService.processOrderRewards(orderId)
    const ue=paidOrder.user?.email;const up=paidOrder.user?.phone;const nv={orderNo:paidOrder.orderNo,orderAmount:paidOrder.totalAmount.toFixed(2),payAmount:paidOrder.payAmount.toFixed(2),userName:paidOrder.user?.nickname??paidOrder.user?.phone}
    if(ue)sendEmail({to:ue,templateType:'order_paid',variables:nv}).catch(function(err){logger.error('邮件失败',{error:String(err)})})
    if(up)sendSms({to:up,templateType:'order_paid',variables:nv}).catch(function(err){logger.error('短信失败',{error:String(err)})})
    sendInApp({userId:paidOrder.userId,templateType:'order_paid',variables:nv}).catch(function(err){logger.error('站内信失败',{error:String(err)})})
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
    sendInApp({ userId: order.userId, templateType: 'order_shipped', variables: notifyVars }).catch((err) => {
      logger.error('发送订单发货站内信失败', { error: err instanceof Error ? err.message : String(err) })
    })

    return order
  }

  // 确认收货
  static async completeOrder(orderId: string) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: ORDER_STATUS.COMPLETED,
        completedAt: new Date(),
      },
      include: { user: true },
    })
    const vars = {
      orderNo: order.orderNo,
      userName: order.user?.nickname ?? order.user?.phone ?? '',
    }
    sendInApp({ userId: order.userId, templateType: 'order_completed', variables: vars }).catch((err) => {
      logger.error('发送订单完成站内信失败', { error: err instanceof Error ? err.message : String(err) })
    })
    return order
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

      // v43-6 Batch 4: 退回余额 + 写 balance_record
      if (order.payAmount > 0) {
        const refundUser = await tx.user.findUnique({
          where: { id: order.userId },
          select: { balance: true, frozenBalance: true, consumeBalance: true },
        })
        if (refundUser) {
          await tx.user.update({
            where: { id: order.userId },
            data: { balance: { increment: order.payAmount }, consumeBalance: { decrement: order.payAmount } },
          })
          const newBalance = refundUser.balance + order.payAmount
          await tx.balanceRecord.create({
            data: {
              userId: order.userId,
              type: 'refund',
              amount: order.payAmount,
              balance: newBalance,
              frozenBalance: refundUser.frozenBalance,
              sourceType: 'order',
              sourceId: orderId,
              description: '订单 ' + order.orderNo + ' 退款',
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

    const cancelledOrder = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
    if (cancelledOrder) {
      const vars = {
        orderNo: cancelledOrder.orderNo,
        reason: '您主动取消',
        userName: cancelledOrder.user?.nickname ?? cancelledOrder.user?.phone ?? '',
      }
      sendInApp({ userId: cancelledOrder.userId, templateType: 'order_cancelled', variables: vars }).catch((err) => {
        logger.error('发送订单取消站内信失败', { error: err instanceof Error ? err.message : String(err) })
      })
    }

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