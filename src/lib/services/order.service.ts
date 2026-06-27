import { prisma } from '@/lib/prisma'
import { ORDER_STATUS } from '@/lib/constants'
import { sendInApp } from '@/lib/notification/sendInApp'
import { logger } from '@/lib/logger'

/**
 * v50 N-1: 订单 service（拆分后）
 *
 * 保留方法（9 个）：
 * - createOrder（订单创建）
 * - getUserOrders / getOrderDetail（订单查询）
 * - notifyOrderPaid / notifyOrderShipped / notifyBalanceChange
 *   notifyRefundReview / notifyRefundCompleted / notifyRefundSubmitted（通知）
 *
 * 拆出的方法（7 个 → order-lifecycle.service.ts）：
 * - payOrder / verifyPayment（支付）
 * - shipOrder / completeOrder / autoCompleteOrders（履约）
 * - requestRefund / cancelOrder（退款 + 取消）
 *
 * 第二刀计划：把 6 个 notify 方法也拆到 order-notification.service.ts
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

  // v46.10.3: 抽公共方法 - 订单支付通知（给 verify-payment 路由调用，修复死代码）
  static async notifyOrderPaid(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    })
    if (!order) return
    const nv = {
      orderNo: order.orderNo,
      orderAmount: order.totalAmount.toFixed(2),
      payAmount: order.payAmount.toFixed(2),
      userName: order.user?.nickname ?? order.user?.phone,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '订单支付通知',
            content: '订单 ' + order.orderNo + ' 已支付',
            templateType: 'order_paid',
            recipientCount: 1,
            senderId: null,
          },
        })
        await sendInApp({
          userId: order.userId,
          templateType: 'order_paid',
          variables: nv,
          batchId: b.id,
        })
      } catch (err) {
        console.error('[v46.10.3 notifyOrderPaid]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('站内信失败', { error: String(err) })
      }
    })()
  }

  // v46.10.3: 抽公共方法 - 订单发货通知（给 admin/orders 路由调用，修复死代码）
  static async notifyOrderShipped(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    })
    if (!order) return
    const notifyVars = {
      orderNo: order.orderNo,
      trackingNumber: (order as any).trackingNumber || '',
      userName: order.user?.nickname ?? order.user?.phone,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '订单发货通知',
            content: '订单 ' + order.orderNo + ' 已发货',
            templateType: 'order_shipped',
            recipientCount: 1,
            senderId: null,
          },
        })
        await sendInApp({
          userId: order.userId,
          templateType: 'order_shipped',
          variables: notifyVars,
          batchId: b.id,
        })
      } catch (err) {
        console.error('[v46.10.3 notifyOrderShipped]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('发货通知失败', { error: String(err) })
      }
    })()
  }

  // v46.11: 抽公共方法 - 余额变动通知（给 admin/users/[id]/balance 路由调用）
  static async notifyBalanceChange(params: {
    userId: string
    adjustType: string  // balance / frozenBalance / recharge / consume_void / earnings_add / earnings_void
    amount: number
    newBalance: number
    reason: string
    operatorId?: string
  }) {
    const typeLabelMap: Record<string, string> = {
      balance: '余额调账',
      frozenBalance: '冻结余额调账',
      recharge: '充值',
      consume_void: '消费余额作废',
      earnings_add: '收益到账',
      earnings_void: '收益作废',
    }
    const changeType = typeLabelMap[params.adjustType] || params.adjustType
    const sign = params.amount > 0 ? '+' : ''
    const variables = {
      changeType,
      changeAmount: `${sign}${params.amount.toFixed(2)}`,
      newBalance: params.newBalance.toFixed(2),
      reason: params.reason,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '账户余额变动通知',
            content: `${changeType} ¥${variables.changeAmount}，当前余额 ¥${variables.newBalance}`,
            templateType: 'balance_change',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'balance_change',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v46.11 notifyBalanceChange]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('余额变动通知失败', { error: String(err) })
      }
    })()
  }

  // v46.12: 抽公共方法 - 退款审核通知（admin 通过/拒绝退款申请时触发）
  static async notifyRefundReview(params: {
    userId: string
    refundId: string
    action: 'approve' | 'reject'
    adminComment?: string
    operatorId?: string
  }) {
    const result = params.action === 'approve' ? '通过' : '拒绝'
    const variables: Record<string, string> = {
      result,
      refundId: params.refundId,
      refundReason: params.action === 'reject' && params.adminComment
        ? `，原因：${params.adminComment}`
        : '',
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: `退款审核${result}通知`,
            content: `退款申请已${result}${variables.refundReason}`,
            templateType: 'refund_review',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'refund_review',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v46.12 notifyRefundReview]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('退款审核通知失败', { error: String(err) })
      }
    })()
  }

  // v46.12: 抽公共方法 - 退款完成通知（admin 确认退款完成时触发）
  static async notifyRefundCompleted(params: {
    userId: string
    orderId: string
    orderNo: string
    amount: number
    operatorId?: string
  }) {
    const variables = {
      orderNo: params.orderNo,
      amount: params.amount.toFixed(2),
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '退款完成通知',
            content: `订单 ${params.orderNo} 退款 ¥${params.amount.toFixed(2)} 已完成`,
            templateType: 'refund_completed',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'refund_completed',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v46.12 notifyRefundCompleted]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('退款完成通知失败', { error: String(err) })
      }
    })()
  }

  // v50 M: 用户提交退款申请时发站内信通知（补全退款流程第 1 个节点）
  static async notifyRefundSubmitted(params: {
    userId: string
    refundId: string
    orderId: string
    orderNo: string
    amount: number
  }) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { nickname: true, phone: true },
      })
      const userName = user?.nickname || user?.phone || '用户'

      const batch = await prisma.notificationBatch.create({
        data: {
          type: 'business',
          title: '退款申请已提交',
          content: `订单 ${params.orderNo} 退款申请已提交，等待审核`,
          templateType: 'refund_submitted',
          recipientCount: 1,
          senderId: null,
        },
      })

      await sendInApp({
        userId: params.userId,
        templateType: 'refund_submitted',
        variables: {
          userName,
          orderNo: params.orderNo,
          amount: params.amount.toFixed(2),
        },
        batchId: batch.id,
      })
    } catch (err) {
      console.error('[v50 M notifyRefundSubmitted]', {
        error: String(err),
        code: (err as any)?.code,
        meta: (err as any)?.meta,
      })
      logger.error('发送退款申请站内信失败', { error: String(err) })
    }
  }
}
