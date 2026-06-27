import { prisma } from '@/lib/prisma'
import { sendInApp } from '@/lib/notification/sendInApp'
import { logger } from '@/lib/logger'

/**
 * v50 N-2: 订单通知 service
 *
 * 从 order.service.ts 拆出的 6 个通知方法：
 * - notifyOrderPaid（订单支付）
 * - notifyOrderShipped（订单发货）
 * - notifyBalanceChange（余额变动）
 * - notifyRefundReview（退款审核通过/拒绝）
 * - notifyRefundCompleted（退款完成）
 * - notifyRefundSubmitted（退款申请提交）
 *
 * 设计目标：
 * - 消除 N-1 遗留的 lifecycle → order 反向依赖
 * - 6 个 notify 集中管理，便于后续统一改造（如支持多渠道/批量通知）
 */
export class OrderNotificationService {
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
