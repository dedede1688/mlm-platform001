import { prisma } from '@/lib/prisma'
import { RewardService } from './reward.service'
import { OrderNotificationService } from './order-notification.service'
import { ORDER_STATUS, BALANCE_SELECT } from '@/lib/constants'
import { sendEmail } from '@/lib/notification/sendEmail'
import { sendSms } from '@/lib/notification/sendSms'
import { logger } from '@/lib/logger'
import { verifyPaymentPassword } from '@/lib/auth/payment-password'
import { getSystemParameter } from '@/lib/config/system-parameters'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'

/**
 * v50 N-1: 订单生命周期 service
 *
 * 从 order.service.ts 拆出的 7 个状态机方法：
 * - payOrder / verifyPayment（支付）
 * - shipOrder / completeOrder / autoCompleteOrders（履约）
 * - requestRefund / cancelOrder（退款 + 取消）
 *
 * 保留在 order.service.ts 的方法（第一刀未动）：
 * - createOrder / getUserOrders / getOrderDetail（订单 CRUD）
 * - notifyOrderPaid / notifyOrderShipped / notifyBalanceChange
 *   notifyRefundReview / notifyRefundCompleted / notifyRefundSubmitted（通知）
 *
 * 依赖：OrderNotificationService（v50 N-2 消除反向依赖，lifecycle → notification 单向）
 */
export class OrderLifecycleService {
  // 验证支付密码并支付订单（v50.1-K：统一支付密码校验入口）
  static async verifyPayment(orderId: string, password: string) {
    // 查订单
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    })
    if (!order) throw new Error('订单不存在')
    if (order.status !== ORDER_STATUS.PENDING) throw new Error('订单不存在或状态已变更')

    // 查用户支付密码hash
    const pwUser = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { paymentPasswordHash: true },
    })

    const pwHash = pwUser?.paymentPasswordHash
    if (!pwHash) throw new Error('尚未设置支付密码，请先设置')

    // 校验支付密码
    const valid = await verifyPaymentPassword(password, pwHash)
    if (!valid) throw new Error('支付密码错误')

    // 事务：标记订单为已支付 + 扣减余额 + 写balance_record
    const paidOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: ORDER_STATUS.PENDING },
        data: {
          status: ORDER_STATUS.PAID,
          paymentVerified: true,
          paidAt: new Date(),
        },
      })
      if (updated.count === 0) throw new Error('订单不存在或状态已变更')

      if (order.payAmount > 0) {
        const freshUser = await tx.user.findUnique({
          where: { id: order.userId },
          select: BALANCE_SELECT,
        })
        if (!freshUser) throw new Error('用户不存在')

        const balanceUpdated = await tx.user.updateMany({
          where: {
            id: order.userId,
            balance: { gte: order.payAmount },
          },
          data: {
            balance: { decrement: order.payAmount },
            consumeBalance: { increment: order.payAmount },
          },
        })
        if (balanceUpdated.count === 0) throw new Error('可用余额不足')

        const newBalance = freshUser.balance - order.payAmount
        const afterPay2 = { consumeBalance: freshUser.consumeBalance + order.payAmount, earningsAvailable: freshUser.earningsAvailable, earningsPending: freshUser.earningsPending, earningsVoided: freshUser.earningsVoided }
        await tx.balanceRecord.create({
          data: {
            userId: order.userId,
            type: 'payment',
            amount: -order.payAmount,
            balance: newBalance,
            frozenBalance: freshUser.frozenBalance,
            sourceType: 'order',
            sourceId: orderId,
            description: `订单 ${order.orderNo} 支付${format4FieldDelta(freshUser, afterPay2)}`,
          },
        })
      }

      return await tx.order.findUnique({
        where: { id: orderId },
        include: { user: true, items: { include: { product: true } } },
      })
    })

    if (!paidOrder) throw new Error('订单不存在')

    // 触发奖励发放
    await RewardService.processOrderRewards(orderId)

    // 触发订单支付通知（v50 N-2: lifecycle → notification 单向依赖）
    await OrderNotificationService.notifyOrderPaid(orderId)

    return paidOrder
  }

  // 发货
  static async shipOrder(orderId: string, _trackingNo?: string) {
    const updated = await prisma.order.updateMany({
      where: { id: orderId, status: ORDER_STATUS.PAID },
      data: {
        status: ORDER_STATUS.SHIPPED,
        shippedAt: new Date(),
      },
    })
    if (updated.count === 0) throw new Error('订单不存在或状态已变更')

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    })
    if (!order) throw new Error('订单不存在')

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
    await OrderNotificationService.notifyOrderShipped(orderId)

    return order
  }

  // 确认收货
  static async completeOrder(orderId: string) {
    const updated = await prisma.order.updateMany({
      where: { id: orderId, status: ORDER_STATUS.SHIPPED },
      data: {
        status: ORDER_STATUS.COMPLETED,
        completedAt: new Date(),
      },
    })
    if (updated.count === 0) throw new Error('订单不存在或状态已变更')

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    })
    if (!order) throw new Error('订单不存在')
    await OrderNotificationService.notifyOrderCompleted(orderId)
    return order
  }

  // 自动确认收货（v50 L: 用 system-parameters 替换硬编码 7 天）
  static async autoCompleteOrders() {
    const autoConfirmDays = Number(await getSystemParameter('auto_confirm_days'))
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - autoConfirmDays)

    const orders = await prisma.order.findMany({
      where: {
        status: ORDER_STATUS.SHIPPED,
        shippedAt: {
          lte: cutoffDate,
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
          select: BALANCE_SELECT,
        })
        if (refundUser) {
          const refundUpdated = await tx.user.updateMany({
            where: { id: order.userId, consumeBalance: { gte: order.payAmount } },
            data: { balance: { increment: order.payAmount }, consumeBalance: { decrement: order.payAmount } },
          })
          if (refundUpdated.count === 0) throw new Error('消费余额不足')
          const newBalance = refundUser.balance + order.payAmount
          const afterRefund = { consumeBalance: refundUser.consumeBalance - order.payAmount, earningsAvailable: refundUser.earningsAvailable, earningsPending: refundUser.earningsPending, earningsVoided: refundUser.earningsVoided }
          await tx.balanceRecord.create({
            data: {
              userId: order.userId,
              type: 'refund',
              amount: order.payAmount,
              balance: newBalance,
              frozenBalance: refundUser.frozenBalance,
              sourceType: 'order',
              sourceId: orderId,
              description: '订单 ' + order.orderNo + ' 退款' + format4FieldDelta(refundUser, afterRefund),
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
      await OrderNotificationService.notifyOrderCancelled({
        orderId,
        reason: '您主动取消',
      })
    }

    return prisma.order.findUnique({ where: { id: orderId } })
  }
}
