import { prisma } from '@/lib/prisma'

function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

export class NotificationService {
  static async sendWithdrawalNotification(params: {
    userId: string
    type: 'withdrawal_approved' | 'withdrawal_rejected' | 'withdrawal_completed'
    withdrawalId: string
    amount: number
    rejectReason?: string
    paymentProofUrl?: string
  }) {
    const template = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type: 'withdrawal_result', channel: 'in_app' } },
    })

    let title: string
    let content: string

    if (template && template.enabled) {
      const statusMap: Record<string, string> = {
        withdrawal_approved: '通过',
        withdrawal_rejected: '拒绝',
        withdrawal_completed: '完成',
      }
      const status = statusMap[params.type] || '处理'
      const reason = params.type === 'withdrawal_rejected' ? `原因：${params.rejectReason || '无'}` : ''
      const proof = params.type === 'withdrawal_completed' && params.paymentProofUrl ? `打款凭证：${params.paymentProofUrl}` : ''
      const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { nickname: true, phone: true } })
      const variables: Record<string, string> = {
        userName: user?.nickname ?? user?.phone ?? '用户',
        amount: params.amount.toFixed(2),
        status,
        reason,
        proof,
        rejectReason: params.rejectReason || '无',
      }
      title = replaceVariables(template.subject ?? '', variables)
      content = replaceVariables(template.content, variables)
    } else {
      if (params.type === 'withdrawal_approved') {
        title = '提现审核通过'
        content = `您的提现申请 ¥${params.amount} 已审核通过，等待财务打款，请留意后续到账通知。`
      } else if (params.type === 'withdrawal_rejected') {
        title = '提现审核拒绝'
        content = `您的提现申请 ¥${params.amount} 已被拒绝，原因：${params.rejectReason || '无'}。冻结收益已退回可提现收益。`
      } else {
        title = '提现已完成打款'
        content = `您的提现申请 ¥${params.amount} 已完成打款。${params.paymentProofUrl ? `打款凭证：${params.paymentProofUrl}` : ''}。可在提现记录中查看详情。`
      }
    }

    const batch = await prisma.notificationBatch.create({
      data: {
        type: 'business',
        title,
        content,
        templateType: 'withdrawal_result',
        recipientCount: 1,
        senderId: null,
      },
    })

    return prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title,
        content,
        sourceId: params.withdrawalId,
        sourceType: 'withdrawal',
        batchId: batch.id,
      },
    })
  }

  static async listMyNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ])

    return {
      notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      unreadCount,
    }
  }

  static async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    })
    if (!notification) throw new Error('通知不存在')
    if (notification.userId !== userId) throw new Error('无权操作')

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    })
  }

  static async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, isRead: false },
    })
  }
}
