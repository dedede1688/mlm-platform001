import { prisma } from '@/lib/prisma'

export class NotificationService {
  static async sendWithdrawalNotification(params: {
    userId: string
    type: 'withdrawal_approved' | 'withdrawal_rejected'
    withdrawalId: string
    amount: number
    rejectReason?: string
  }) {
    const isApproved = params.type === 'withdrawal_approved'
    return prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: isApproved ? '提现审核通过' : '提现审核拒绝',
        content: isApproved
          ? `您的提现申请 ¥${params.amount} 已审核通过，请注意查收。`
          : `您的提现申请 ¥${params.amount} 已被拒绝，原因：${params.rejectReason || '无'}`,
        sourceId: params.withdrawalId,
        sourceType: 'withdrawal',
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