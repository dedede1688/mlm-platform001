import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  })
  return { prisma: { notification: createMockChain(), notificationTemplate: createMockChain(), notificationBatch: createMockChain(), user: createMockChain() } }
})

import { prisma } from '@/lib/prisma'
import { NotificationService } from '@/lib/services/notification.service'

describe('NotificationService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should send withdrawal approved notification with template', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({ id: 't1', enabled: true, subject: '提现审核结果', content: '已审核{{status}}' })
    prisma.user.findUnique.mockResolvedValueOnce({ nickname: '张三', phone: '13800000001' })
    prisma.notificationBatch.create.mockResolvedValueOnce({ id: 'b1' })
    const notif = { id: 'n1', userId: 'u1', type: 'withdrawal_approved' }
    prisma.notification.create.mockResolvedValueOnce(notif)
    const result = await NotificationService.sendWithdrawalNotification({
      userId: 'u1', type: 'withdrawal_approved', withdrawalId: 'w1', amount: 100,
    })
    expect(result).toEqual(notif)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'withdrawal_approved', title: '提现审核结果', content: '已审核通过', batchId: 'b1' }),
    })
  })

  it('should send withdrawal rejected notification with template', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({ id: 't1', enabled: true, subject: '提现审核结果', content: '已审核{{status}}' })
    prisma.user.findUnique.mockResolvedValueOnce({ nickname: '李四', phone: '13800000002' })
    prisma.notificationBatch.create.mockResolvedValueOnce({ id: 'b2' })
    const notif = { id: 'n2', userId: 'u1', type: 'withdrawal_rejected' }
    prisma.notification.create.mockResolvedValueOnce(notif)
    const result = await NotificationService.sendWithdrawalNotification({
      userId: 'u1', type: 'withdrawal_rejected', withdrawalId: 'w1', amount: 100, rejectReason: '信息不完整',
    })
    expect(result).toEqual(notif)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'withdrawal_rejected', content: '已审核拒绝', batchId: 'b2' }),
    })
  })

  it('should fallback to hardcoded string when template not found', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce(null)
    prisma.notificationBatch.create.mockResolvedValueOnce({ id: 'b3' })
    const notif = { id: 'n3', userId: 'u1', type: 'withdrawal_approved' }
    prisma.notification.create.mockResolvedValueOnce(notif)
    const result = await NotificationService.sendWithdrawalNotification({
      userId: 'u1', type: 'withdrawal_approved', withdrawalId: 'w1', amount: 100,
    })
    expect(result).toEqual(notif)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '提现审核通过', batchId: 'b3' }),
    })
  })

  it('should fallback when template is disabled', async () => {
    prisma.notificationTemplate.findUnique.mockResolvedValueOnce({ id: 't1', enabled: false })
    prisma.notificationBatch.create.mockResolvedValueOnce({ id: 'b4' })
    const notif = { id: 'n4', userId: 'u1', type: 'withdrawal_rejected' }
    prisma.notification.create.mockResolvedValueOnce(notif)
    const result = await NotificationService.sendWithdrawalNotification({
      userId: 'u1', type: 'withdrawal_rejected', withdrawalId: 'w1', amount: 100, rejectReason: '余额不足',
    })
    expect(result).toEqual(notif)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: '提现审核拒绝', batchId: 'b4' }),
    })
  })

  it('should list my notifications with unread count', async () => {
    prisma.notification.findMany.mockResolvedValueOnce([{ id: 'n1' }])
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    const result = await NotificationService.listMyNotifications('u1', 1, 20)
    expect(result.notifications).toEqual([{ id: 'n1' }])
    expect(result.unreadCount).toBe(0)
  })

  it('should mark notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({ id: 'n1', userId: 'u1', isRead: false })
    prisma.notification.update.mockResolvedValueOnce({ id: 'n1', isRead: true })
    const result = await NotificationService.markAsRead('n1', 'u1')
    expect(result.isRead).toBe(true)
  })

  it('should throw error when notification not found', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce(null)
    await expect(NotificationService.markAsRead('n1', 'u1')).rejects.toThrow('通知不存在')
  })

  it('should throw error when user has no permission', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce({ id: 'n1', userId: 'u2', isRead: false })
    await expect(NotificationService.markAsRead('n1', 'u1')).rejects.toThrow('无权操作')
  })

  it('should get unread count', async () => {
    prisma.notification.count.mockResolvedValueOnce(5)
    const result = await NotificationService.getUnreadCount('u1')
    expect(result).toBe(5)
  })
})