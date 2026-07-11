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

  // v57.2 B: 抽公共方法 - 积分变动通知（给 admin/users/[id]/points 路由调用）
  static async notifyPointsAdjust(params: {
    userId: string
    fieldLabel: string  // 总积分 / 可用积分 / 锁定积分
    amount: number
    newTotalPoints: number
    newUnlockedPoints: number
    newLockedPoints: number
    reason: string
    operatorId?: string
  }) {
    const sign = params.amount > 0 ? '+' : ''
    const variables = {
      fieldLabel: params.fieldLabel,
      changeAmount: `${sign}${params.amount}`,
      newTotalPoints: String(params.newTotalPoints),
      newUnlockedPoints: String(params.newUnlockedPoints),
      newLockedPoints: String(params.newLockedPoints),
      reason: params.reason,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '账户积分变动通知',
            content: `${params.fieldLabel} ${variables.changeAmount} 积分，当前总积分 ${params.newTotalPoints}`,
            templateType: 'points_adjust',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'points_adjust',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v57.2 notifyPointsAdjust]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('积分变动通知失败', { error: String(err) })
      }
    })()
  }

  // v57.4: 抽公共方法 - 每日积分解锁通知（给 points.service.ts dailyUnlock 调用）
  static async notifyPointsUnlock(params: {
    userId: string
    unlockAmount: number
    newUnlockedPoints: number
    newLockedPoints: number
    completedDays: number
  }) {
    const variables = {
      unlockAmount: String(params.unlockAmount),
      newUnlockedPoints: String(params.newUnlockedPoints),
      newLockedPoints: String(params.newLockedPoints),
      completedDays: String(params.completedDays),
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '每日积分解锁通知',
            content: `积分自动解锁 ${params.unlockAmount}，当前可用 ${params.newUnlockedPoints}`,
            templateType: 'points_unlock',
            recipientCount: 1,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'points_unlock',
          variables,
          batchId: b.id,
        })
      } catch (err) {
        console.error('[v57.4 notifyPointsUnlock]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('积分解锁通知失败', { error: String(err) })
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

  // v54 阶段4: 订单完成通知
  static async notifyOrderCompleted(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    })
    if (!order) return
    const variables = {
      orderNo: order.orderNo,
      userName: order.user?.nickname ?? order.user?.phone ?? '',
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '订单完成通知',
            content: '订单 ' + order.orderNo + ' 已完成',
            templateType: 'order_completed',
            recipientCount: 1,
            senderId: null,
          },
        })
        await sendInApp({
          userId: order.userId,
          templateType: 'order_completed',
          variables,
          batchId: b.id,
        })
      } catch (err) {
        console.error('[v54 notifyOrderCompleted]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('订单完成通知失败', { error: String(err) })
      }
    })()
  }

  // v54 阶段4: 订单取消通知
  static async notifyOrderCancelled(params: { orderId: string; reason?: string }) {
    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      include: { user: true },
    })
    if (!order) return
    const reason = params.reason || '管理员操作'
    const variables = {
      orderNo: order.orderNo,
      reason,
      userName: order.user?.nickname ?? order.user?.phone ?? '',
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '订单取消通知',
            content: '订单 ' + order.orderNo + ' 已取消',
            templateType: 'order_cancelled',
            recipientCount: 1,
            senderId: null,
          },
        })
        await sendInApp({
          userId: order.userId,
          templateType: 'order_cancelled',
          variables,
          batchId: b.id,
        })
      } catch (err) {
        console.error('[v54 notifyOrderCancelled]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('订单取消通知失败', { error: String(err) })
      }
    })()
  }

  // v54 阶段4: 账户状态变更通知
  static async notifyUserStatusChange(params: {
    userId: string
    status: 'active' | 'frozen'
    reason: string
    operatorId?: string
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { nickname: true, phone: true },
    })
    if (!user) return
    const statusLabel = params.status === 'active' ? '解封' : '冻结'
    const variables = {
      userName: user.nickname ?? user.phone ?? '',
      statusLabel,
      reason: params.reason,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: `账户${statusLabel}通知`,
            content: `您的账户已被${statusLabel}，原因：${params.reason}`,
            templateType: 'user_status_change',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'user_status_change',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v54 notifyUserStatusChange]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('账户状态变更通知失败', { error: String(err) })
      }
    })()
  }

  // v54 阶段4: 积分作废通知
  static async notifyPointsVoid(params: {
    userId: string
    amount: number
    reason: string
    remainingPoints: number
    operatorId?: string
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { nickname: true, phone: true },
    })
    if (!user) return
    const variables = {
      userName: user.nickname ?? user.phone ?? '',
      amount: params.amount.toString(),
      reason: params.reason,
      remainingPoints: params.remainingPoints.toString(),
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '积分作废通知',
            content: `您的 ${params.amount} 积分已被作废，原因：${params.reason}`,
            templateType: 'points_void',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'points_void',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v54 notifyPointsVoid]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('积分作废通知失败', { error: String(err) })
      }
    })()
  }

  // v54 阶段4: 手动奖励到账通知
  static async notifyManualReward(params: {
    userId: string
    amount: number
    reason: string
    operatorId?: string
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { nickname: true, phone: true },
    })
    if (!user) return
    const variables = {
      userName: user.nickname ?? user.phone ?? '',
      amount: params.amount.toFixed(2),
      reason: params.reason,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '手动奖励到账通知',
            content: `您收到一笔手动奖励 ¥${params.amount.toFixed(2)}，原因：${params.reason}`,
            templateType: 'manual_reward',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'manual_reward',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
        })
      } catch (err) {
        console.error('[v54 notifyManualReward]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('手动奖励通知失败', { error: String(err) })
      }
    })()
  }

  // v3.2-1-hotfix: 充值审核通过通知（admin 审核通过充值申请后触发）
  static async notifyRechargeApproved(params: {
    userId: string
    rechargeId: string
    amount: number
    newBalance: number
    operatorId?: string
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { nickname: true, phone: true },
    })
    if (!user) return
    const variables = {
      userName: user.nickname ?? user.phone ?? '',
      amount: params.amount.toFixed(2),
      newBalance: params.newBalance.toFixed(2),
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '充值审核通过通知',
            content: `您的充值申请 ¥${params.amount.toFixed(2)} 已审核通过，余额已入账`,
            templateType: 'recharge_approved',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'recharge_approved',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
          sourceType: 'recharge_request',
          sourceId: params.rechargeId,
        })
      } catch (err) {
        console.error('[v3.2-1-hotfix notifyRechargeApproved]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('充值审核通过通知失败', { error: String(err) })
      }
    })()
  }

  // v3.2-1-hotfix: 充值审核拒绝通知（admin 拒绝充值申请后触发）
  static async notifyRechargeRejected(params: {
    userId: string
    rechargeId: string
    amount: number
    rejectReason: string
    operatorId?: string
  }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { nickname: true, phone: true },
    })
    if (!user) return
    const variables = {
      userName: user.nickname ?? user.phone ?? '',
      amount: params.amount.toFixed(2),
      rejectReason: params.rejectReason,
    }
    await (async () => {
      try {
        const b = await prisma.notificationBatch.create({
          data: {
            type: 'business',
            title: '充值审核拒绝通知',
            content: `您的充值申请 ¥${params.amount.toFixed(2)} 已被拒绝，原因：${params.rejectReason}`,
            templateType: 'recharge_rejected',
            recipientCount: 1,
            senderId: params.operatorId ?? null,
          },
        })
        await sendInApp({
          userId: params.userId,
          templateType: 'recharge_rejected',
          variables,
          batchId: b.id,
          senderId: params.operatorId,
          sourceType: 'recharge_request',
          sourceId: params.rechargeId,
        })
      } catch (err) {
        console.error('[v3.2-1-hotfix notifyRechargeRejected]', {
          error: String(err),
          code: (err as any)?.code,
          meta: (err as any)?.meta,
        })
        logger.error('充值审核拒绝通知失败', { error: String(err) })
      }
    })()
  }

  // 充值申请提交通知（用户提交充值申请后触发）
  static async notifyRechargeSubmitted(params: {
    userId: string
    rechargeId: string
    amount: number
    operatorId?: string
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
          title: '充值申请已提交',
          content: `您的充值申请 ¥${params.amount.toFixed(2)} 已提交成功，等待平台审核`,
          templateType: 'recharge_submitted',
          recipientCount: 1,
          senderId: params.operatorId ?? null,
        },
      })

      await sendInApp({
        userId: params.userId,
        templateType: 'recharge_submitted',
        variables: {
          userName,
          amount: params.amount.toFixed(2),
        },
        batchId: batch.id,
        sourceType: 'recharge_request',
        sourceId: params.rechargeId,
      })
    } catch (err) {
      console.error('[notifyRechargeSubmitted]', {
        error: String(err),
        code: (err as any)?.code,
        meta: (err as any)?.meta,
      })
      logger.error('充值申请提交通知失败', { error: String(err) })
    }
  }

  // 收益转余额通知（用户把可用收益转入购物余额后触发）
  static async notifyEarningsTransferred(params: {
    userId: string
    amount: number
    balance: number
    earningsAvailable: number
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
          title: '收益转入购物余额通知',
          content: `您的收益 ¥${params.amount.toFixed(2)} 已成功转入购物余额，当前购物余额 ¥${params.balance.toFixed(2)}`,
          templateType: 'earnings_transferred',
          recipientCount: 1,
          senderId: null,
        },
      })

      await sendInApp({
        userId: params.userId,
        templateType: 'earnings_transferred',
        variables: {
          userName,
          amount: params.amount.toFixed(2),
          balance: params.balance.toFixed(2),
          earningsAvailable: params.earningsAvailable.toFixed(2),
        },
        batchId: batch.id,
        sourceType: 'earnings_transfer',
        sourceId: params.userId,
      })
    } catch (err) {
      console.error('[notifyEarningsTransferred]', {
        error: String(err),
        code: (err as any)?.code,
        meta: (err as any)?.meta,
      })
      logger.error('收益转余额通知失败', { error: String(err) })
    }
  }
}
