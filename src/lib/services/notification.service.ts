import { prisma } from '@/lib/prisma'
import { paginate } from '@/lib/utils/pagination'

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
      pagination: paginate(total, page, limit),
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

  static async getAllTemplates() {
    return prisma.notificationTemplate.findMany({ orderBy: [{ type: 'asc' }, { channel: 'asc' }] })
  }

  static async getTemplateById(id: string) {
    return prisma.notificationTemplate.findUnique({ where: { id } })
  }

  static async findTemplateByTypeChannel(type: string, channel: string) {
    return prisma.notificationTemplate.findUnique({ where: { type_channel: { type, channel } } })
  }

  static async createTemplate(data: { type: string; channel: string; subject?: string | null; content: string; enabled?: boolean }) {
    return prisma.notificationTemplate.create({ data })
  }

  static async updateTemplate(id: string, data: { type?: string; channel?: string; subject?: string | null; content?: string; enabled?: boolean }) {
    return prisma.notificationTemplate.update({ where: { id }, data })
  }

  static async deleteTemplate(id: string) {
    return prisma.notificationTemplate.delete({ where: { id } })
  }

  static async sendNotifications(params: {
    type: string; senderId: string; content: string; subject?: string;
    userIds?: string[]; isAnnouncement?: boolean;
  }) {
    const { type, senderId, content, subject, userIds, isAnnouncement } = params
    let targetUserIds: string[] = []
    if (isAnnouncement) {
      const allUsers = await prisma.user.findMany({ select: { id: true } })
      targetUserIds = allUsers.map(u => u.id)
    } else if (userIds && userIds.length > 0) {
      targetUserIds = userIds
    }
    if (targetUserIds.length === 0) throw new Error('??????')
    const template = await this.findTemplateByTypeChannel(type, 'in_app')
    const finalSubject = subject ?? template?.subject ?? (type === 'general' ? '????' : '????')
    const batch = await prisma.notificationBatch.create({
      data: { type, title: finalSubject, content, templateType: type, recipientCount: targetUserIds.length, senderId },
    })
    const data = targetUserIds.map(userId => ({
      userId, type, title: finalSubject, content, sourceType: type, sourceId: null as string | null, batchId: batch.id, senderId,
    }))
    const result = await prisma.notification.createMany({ data })
    return { count: result.count, type, targetCount: targetUserIds.length, batchId: batch.id }
  }

  static async getBatches(params: { page: number; limit: number; type?: string; status?: string }) {
    const { page, limit, type, status } = params
    const skip = (page - 1) * limit
    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (status) where.status = status
    const [batches, total] = await Promise.all([
      prisma.notificationBatch.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
        include: { sender: { select: { id: true, nickname: true, phone: true } } },
      }),
      prisma.notificationBatch.count({ where }),
    ])
    const enriched = await Promise.all(batches.map(async (batch) => {
      const readCount = await prisma.notification.count({ where: { batchId: batch.id, isRead: true } })
      return { ...batch, readCount }
    }))
    return { batches: enriched, pagination: paginate(total, page, limit) }
  }

  static async getBatch(id: string) {
    return prisma.notificationBatch.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, nickname: true, phone: true } },
        notifications: { include: { user: { select: { id: true, nickname: true, phone: true } } }, orderBy: { createdAt: 'desc' } },
      },
    })
  }

}
