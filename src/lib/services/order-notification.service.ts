import { prisma } from '@/lib/prisma'
import { sendInApp } from '@/lib/notification/sendInApp'
import { logger } from '@/lib/logger'

export class OrderNotificationService {
  static async notifyOrderPaid(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
    if (!order) return
    await this.sendTemplate({
      userId: order.userId, templateType: 'order_paid', title: '订单支付通知',
      content: '订单 ' + order.orderNo + ' 已支付',
      variables: { orderNo: order.orderNo, orderAmount: order.totalAmount.toFixed(2), payAmount: order.payAmount.toFixed(2), userName: order.user?.nickname ?? order.user?.phone },
      notifyName: 'notifyOrderPaid', errorLabel: '站内信失败',
    })
  }

  static async notifyOrderShipped(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
    if (!order) return
    await this.sendTemplate({
      userId: order.userId, templateType: 'order_shipped', title: '订单发货通知',
      content: '订单 ' + order.orderNo + ' 已发货',
      variables: { orderNo: order.orderNo, trackingNumber: (order as any).trackingNumber || '', userName: order.user?.nickname ?? order.user?.phone },
      notifyName: 'notifyOrderShipped', errorLabel: '发货通知失败',
    })
  }

  static async notifyBalanceChange(params: {
    userId: string; adjustType: string; amount: number; newBalance: number; reason: string; operatorId?: string
  }) {
    const typeLabelMap: Record<string, string> = {
      balance: '余额调账', frozenBalance: '冻结余额调账', recharge: '充值',
      consume_void: '消费余额作废', earnings_add: '收益到账', earnings_void: '收益作废',
    }
    const changeType = typeLabelMap[params.adjustType] || params.adjustType
    const sign = params.amount > 0 ? '+' : ''
    const variables = { changeType, changeAmount: `${sign}${params.amount.toFixed(2)}`, newBalance: params.newBalance.toFixed(2), reason: params.reason }
    await this.sendTemplate({
      userId: params.userId, templateType: 'balance_change', title: '账户余额变动通知',
      content: `${changeType} ¥${variables.changeAmount}，当前余额 ¥${variables.newBalance}`,
      variables, notifyName: 'notifyBalanceChange', errorLabel: '余额变动通知失败', senderId: params.operatorId,
    })
  }

  static async notifyPointsAdjust(params: {
    userId: string; fieldLabel: string; amount: number; newTotalPoints: number; newUnlockedPoints: number; newLockedPoints: number; reason: string; operatorId?: string
  }) {
    const sign = params.amount > 0 ? '+' : ''
    const variables = {
      fieldLabel: params.fieldLabel, changeAmount: `${sign}${params.amount}`,
      newTotalPoints: String(params.newTotalPoints), newUnlockedPoints: String(params.newUnlockedPoints),
      newLockedPoints: String(params.newLockedPoints), reason: params.reason,
    }
    await this.sendTemplate({
      userId: params.userId, templateType: 'points_adjust', title: '账户积分变动通知',
      content: `${params.fieldLabel} ${variables.changeAmount} 积分，当前总积分 ${params.newTotalPoints}`,
      variables, notifyName: 'notifyPointsAdjust', errorLabel: '积分变动通知失败', senderId: params.operatorId,
    })
  }

  static async notifyPointsUnlock(params: {
    userId: string; unlockAmount: number; newUnlockedPoints: number; newLockedPoints: number; completedDays: number
  }) {
    const variables = {
      unlockAmount: String(params.unlockAmount), newUnlockedPoints: String(params.newUnlockedPoints),
      newLockedPoints: String(params.newLockedPoints), completedDays: String(params.completedDays),
    }
    await this.sendTemplate({
      userId: params.userId, templateType: 'points_unlock', title: '每日积分解锁通知',
      content: `积分自动解锁 ${params.unlockAmount}，当前可用 ${params.newUnlockedPoints}`,
      variables, notifyName: 'notifyPointsUnlock', errorLabel: '积分解锁通知失败', omitSenderId: true,
    })
  }

  static async notifyRefundReview(params: {
    userId: string; refundId: string; orderId: string; orderNo: string; action: 'approve' | 'reject'; adminComment?: string; operatorId?: string
  }) {
    const result = params.action === 'approve' ? '通过' : '拒绝'
    const reasonSuffix = params.action === 'reject' && params.adminComment ? `，原因：${params.adminComment}` : ''
    const title = `退款审核${result}通知`
    const content = `订单 ${params.orderNo} 的退款申请已${result}${reasonSuffix}`
    await this.sendDirectNotification({
      userId: params.userId, templateType: 'refund_review', title, content,
      notifyName: 'notifyRefundReview', errorLabel: '退款审核通知失败', senderId: params.operatorId, sourceType: 'refund', sourceId: params.orderId,
    })
  }

  static async notifyRefundCompleted(params: {
    userId: string; orderId: string; orderNo: string; amount: number; operatorId?: string
  }) {
    await this.sendDirectNotification({
      userId: params.userId, templateType: 'refund_completed', title: '退款完成通知',
      content: `订单 ${params.orderNo} 退款 ¥${params.amount.toFixed(2)} 已完成`,
      notifyName: 'notifyRefundCompleted', errorLabel: '退款完成通知失败', senderId: params.operatorId, sourceType: 'refund', sourceId: params.orderId,
    })
  }

  static async notifyRefundSubmitted(params: {
    userId: string; refundId: string; orderId: string; orderNo: string; amount: number
  }) {
    try {
      const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
      const userName = user?.nickname || user?.phone || '用户'
      await this.sendTemplate({
        userId: params.userId, templateType: 'refund_submitted', title: '退款申请已提交',
        content: `订单 ${params.orderNo} 退款申请已提交，等待审核`,
        variables: { userName, orderNo: params.orderNo, amount: params.amount.toFixed(2) },
        notifyName: 'notifyRefundSubmitted', errorLabel: '发送退款申请站内信失败',
      })
    } catch (err) {
      console.error('[notifyRefundSubmitted]', { error: String(err), code: (err as any)?.code, meta: (err as any)?.meta })
      logger.error('发送退款申请站内信失败', { error: String(err) })
    }
  }

  static async notifyOrderCompleted(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
    if (!order) return
    await this.sendTemplate({
      userId: order.userId, templateType: 'order_completed', title: '订单完成通知',
      content: '订单 ' + order.orderNo + ' 已完成',
      variables: { orderNo: order.orderNo, userName: order.user?.nickname ?? order.user?.phone ?? '' },
      notifyName: 'notifyOrderCompleted', errorLabel: '订单完成通知失败',
    })
  }

  static async notifyOrderCancelled(params: { orderId: string; reason?: string }) {
    const order = await prisma.order.findUnique({ where: { id: params.orderId }, include: { user: true } })
    if (!order) return
    const reason = params.reason || '管理员操作'
    await this.sendTemplate({
      userId: order.userId, templateType: 'order_cancelled', title: '订单取消通知',
      content: '订单 ' + order.orderNo + ' 已取消',
      variables: { orderNo: order.orderNo, reason, userName: order.user?.nickname ?? order.user?.phone ?? '' },
      notifyName: 'notifyOrderCancelled', errorLabel: '订单取消通知失败',
    })
  }

  static async notifyUserStatusChange(params: {
    userId: string; status: 'active' | 'frozen'; reason: string; operatorId?: string
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
    if (!user) return
    const statusLabel = params.status === 'active' ? '解封' : '冻结'
    await this.sendTemplate({
      userId: params.userId, templateType: 'user_status_change', title: `账户${statusLabel}通知`,
      content: `您的账户已被${statusLabel}，原因：${params.reason}`,
      variables: { userName: user.nickname ?? user.phone ?? '', statusLabel, reason: params.reason },
      notifyName: 'notifyUserStatusChange', errorLabel: '账户状态变更通知失败', senderId: params.operatorId,
    })
  }

  static async notifyPointsVoid(params: {
    userId: string; amount: number; reason: string; remainingPoints: number; operatorId?: string
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
    if (!user) return
    await this.sendTemplate({
      userId: params.userId, templateType: 'points_void', title: '积分作废通知',
      content: `您的 ${params.amount} 积分已被作废，原因：${params.reason}`,
      variables: { userName: user.nickname ?? user.phone ?? '', amount: params.amount.toString(), reason: params.reason, remainingPoints: params.remainingPoints.toString() },
      notifyName: 'notifyPointsVoid', errorLabel: '积分作废通知失败', senderId: params.operatorId,
    })
  }

  static async notifyManualReward(params: {
    userId: string; amount: number; reason: string; operatorId?: string
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
    if (!user) return
    await this.sendTemplate({
      userId: params.userId, templateType: 'manual_reward', title: '手动奖励到账通知',
      content: `您收到一笔手动奖励 ¥${params.amount.toFixed(2)}，原因：${params.reason}`,
      variables: { userName: user.nickname ?? user.phone ?? '', amount: params.amount.toFixed(2), reason: params.reason },
      notifyName: 'notifyManualReward', errorLabel: '手动奖励通知失败', senderId: params.operatorId,
    })
  }

  static async notifyRechargeApproved(params: {
    userId: string; rechargeId: string; amount: number; newBalance: number; operatorId?: string
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
    if (!user) return
    await this.sendTemplate({
      userId: params.userId, templateType: 'recharge_approved', title: '充值审核通过通知',
      content: `您的充值申请 ¥${params.amount.toFixed(2)} 已审核通过，余额已入账`,
      variables: { userName: user.nickname ?? user.phone ?? '', amount: params.amount.toFixed(2), newBalance: params.newBalance.toFixed(2) },
      notifyName: 'notifyRechargeApproved', errorLabel: '充值审核通过通知失败', senderId: params.operatorId, sourceType: 'recharge_request', sourceId: params.rechargeId,
    })
  }

  static async notifyRechargeRejected(params: {
    userId: string; rechargeId: string; amount: number; rejectReason: string; operatorId?: string
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
    if (!user) return
    await this.sendTemplate({
      userId: params.userId, templateType: 'recharge_rejected', title: '充值审核拒绝通知',
      content: `您的充值申请 ¥${params.amount.toFixed(2)} 已被拒绝，原因：${params.rejectReason}`,
      variables: { userName: user.nickname ?? user.phone ?? '', amount: params.amount.toFixed(2), rejectReason: params.rejectReason },
      notifyName: 'notifyRechargeRejected', errorLabel: '充值审核拒绝通知失败', senderId: params.operatorId, sourceType: 'recharge_request', sourceId: params.rechargeId,
    })
  }

  static async notifyRechargeSubmitted(params: {
    userId: string; rechargeId: string; amount: number; operatorId?: string
  }) {
    try {
      const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
      const userName = user?.nickname || user?.phone || '用户'
      await this.sendTemplate({
        userId: params.userId, templateType: 'recharge_submitted', title: '充值申请已提交',
        content: `您的充值申请 ¥${params.amount.toFixed(2)} 已提交成功，等待平台审核`,
        variables: { userName, amount: params.amount.toFixed(2) },
        notifyName: 'notifyRechargeSubmitted', errorLabel: '充值申请提交通知失败', senderId: params.operatorId, sourceType: 'recharge_request', sourceId: params.rechargeId,
      })
    } catch (err) {
      console.error('[notifyRechargeSubmitted]', { error: String(err), code: (err as any)?.code, meta: (err as any)?.meta })
      logger.error('充值申请提交通知失败', { error: String(err) })
    }
  }

  static async notifyEarningsVoid(params: {
    userId: string; amount: number; earningsAvailable: number; earningsVoided: number; reason: string; operatorId?: string; balanceRecordId: string
  }) {
    try {
      const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
      if (!user) return
      const userName = user.nickname || user.phone || '用户'
      await this.sendTemplate({
        userId: params.userId, templateType: 'earnings_voided', title: '收益作废通知',
        content: `您的可用收益 ¥${params.amount.toFixed(2)} 已被后台作废，原因：${params.reason}`,
        variables: { userName, amount: params.amount.toFixed(2), earningsAvailable: params.earningsAvailable.toFixed(2), earningsVoided: params.earningsVoided.toFixed(2) },
        notifyName: 'notifyEarningsVoid', errorLabel: '收益作废通知失败', senderId: params.operatorId, sourceType: 'balance_record', sourceId: params.balanceRecordId,
      })
    } catch (err) {
      console.error('[notifyEarningsVoid]', { error: String(err), code: (err as any)?.code, meta: (err as any)?.meta })
      logger.error('收益作废通知失败', { error: String(err) })
    }
  }

  static async notifyPaymentPasswordReset(params: { userId: string; operatorId: string }): Promise<void> {
    try {
      const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
      if (!user) return
      const userName = user.nickname || user.phone || '用户'
      await this.sendTemplate({
        userId: params.userId, templateType: 'payment_password_reset', title: '支付密码重置通知',
        content: `${userName} 您好，您的支付密码已被管理员重置，请尽快设置新的支付密码。`,
        variables: { userName },
        notifyName: 'notifyPaymentPasswordReset', errorLabel: '支付密码重置通知失败', senderId: params.operatorId, sourceType: 'payment_password', sourceId: params.userId,
      })
    } catch (err) {
      console.error('[notifyPaymentPasswordReset]', { error: String(err), code: (err as any)?.code, meta: (err as any)?.meta })
      logger.error('支付密码重置通知失败', { error: String(err) })
    }
  }

  static async notifyEarningsTransferred(params: {
    userId: string; amount: number; balance: number; earningsAvailable: number
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
    const userName = user?.nickname || user?.phone || '用户'
    await this.sendTemplate({
      userId: params.userId, templateType: 'earnings_transferred', title: '收益转入购物余额通知',
      content: `您的收益 ¥${params.amount.toFixed(2)} 已成功转入购物余额，当前购物余额 ¥${params.balance.toFixed(2)}`,
      variables: { userName, amount: params.amount.toFixed(2), balance: params.balance.toFixed(2), earningsAvailable: params.earningsAvailable.toFixed(2) },
      notifyName: 'notifyEarningsTransferred', errorLabel: '收益转余额通知失败', sourceType: 'earnings_transfer', sourceId: params.userId,
    })
  }

  // ─── 私有方法 ───

  private static async sendTemplate(params: {
    userId: string; templateType: string; title: string; content: string;
    variables: Record<string, string>; notifyName: string; errorLabel: string;
    senderId?: string; sourceType?: string; sourceId?: string; omitSenderId?: boolean
  }) {
    try {
      const batchData: any = {
        type: 'business', title: params.title, content: params.content,
        templateType: params.templateType, recipientCount: 1,
      }
      if (!params.omitSenderId) batchData.senderId = params.senderId ?? null
      const batch = await prisma.notificationBatch.create({ data: batchData })
      await sendInApp({
        userId: params.userId, templateType: params.templateType, variables: params.variables,
        batchId: batch.id, senderId: params.senderId, sourceType: params.sourceType, sourceId: params.sourceId,
      })
    } catch (err) {
      console.error(`[${params.notifyName}]`, { error: String(err), code: (err as any)?.code, meta: (err as any)?.meta })
      logger.error(params.errorLabel, { error: String(err) })
    }
  }

  private static async sendDirectNotification(params: {
    userId: string; templateType: string; title: string; content: string;
    notifyName: string; errorLabel: string; senderId?: string; sourceType?: string; sourceId?: string
  }) {
    try {
      const batch = await prisma.notificationBatch.create({
        data: { type: 'business', title: params.title, content: params.content, templateType: params.templateType, recipientCount: 1, senderId: params.senderId ?? null },
      })
      await prisma.notification.create({
        data: {
          userId: params.userId, type: params.templateType, title: params.title, content: params.content,
          sourceType: params.sourceType ?? null, sourceId: params.sourceId ?? null, batchId: batch.id, senderId: params.senderId ?? null,
        },
      })
    } catch (err) {
      console.error(`[${params.notifyName}]`, { error: String(err), code: (err as any)?.code, meta: (err as any)?.meta })
      logger.error(params.errorLabel, { error: String(err) })
    }
  }
}
