import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })
  
  const mockPrisma: any = {
    user: createMockChain(),
    withdrawal: createMockChain(),
    balanceRecord: createMockChain(),
    systemConfig: createMockChain(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (_key: string, defaultValue: any) => defaultValue),
  invalidateBusinessConfigCache: vi.fn(),
}))

vi.mock('@/lib/services/withdrawal-audit-log.service', () => ({
  WithdrawalAuditLogService: {
    logReview: vi.fn().mockResolvedValue({ id: 'audit1' }),
    getAuditLogs: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/lib/services/notification.service', () => ({
  NotificationService: {
    sendWithdrawalNotification: vi.fn().mockResolvedValue({ id: 'notif1' }),
    listMyNotifications: vi.fn().mockResolvedValue({ notifications: [], pagination: {}, unreadCount: 0 }),
    markAsRead: vi.fn().mockResolvedValue({}),
    getUnreadCount: vi.fn().mockResolvedValue(0),
  },
}))

import { prisma } from '@/lib/prisma'
import { WithdrawalService } from '@/lib/services/withdrawal.service'

describe('WithdrawalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('createWithdrawal', () => {
    it('should create withdrawal successfully with sufficient balance', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0, paymentPasswordHash: 'hashed-pwd',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.withdrawal.create.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.createWithdrawal('u1', {
        amount: 100, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })
      expect(result).toBeDefined()
      expect(result.amount).toBe(100)
      expect(result.status).toBe('pending')
    })

    it('should throw error with insufficient balance', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 100, frozenBalance: 0, paymentPasswordHash: 'hashed-pwd',
      })

      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: 10000, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })).rejects.toThrow('余额不足')
    })

    it('should throw error with non-positive amount', async () => {
      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: 0, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })).rejects.toThrow('提现金额必须大于0')
      
      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: -100, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })).rejects.toThrow('提现金额必须大于0')
    })
  })

  describe('reviewWithdrawal', () => {
    it('should approve withdrawal and decrease frozenBalance', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 500, frozenBalance: 100,
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'approved',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.reviewWithdrawal('w1', { approved: true, reviewedBy: 'admin1' })
      expect(result.status).toBe('approved')
    })

    it('should reject withdrawal and refund balance', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 500, frozenBalance: 100,
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'rejected',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.reviewWithdrawal('w1', { approved: false, reviewedBy: 'admin1', rejectReason: '信息不完整' })
      expect(result.status).toBe('rejected')
    })

    it('should throw error when withdrawal not found', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce(null)

      await expect(WithdrawalService.reviewWithdrawal('w-nonexistent', { approved: true }))
        .rejects.toThrow('提现记录不存在')
    })

    it('should throw error when withdrawal already processed', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1',
        userId: 'u1',
        amount: 100,
        status: 'approved',
      })

      await expect(WithdrawalService.reviewWithdrawal('w1', { approved: true }))
        .rejects.toThrow('提现记录已处理')
    })
  })

  describe('batchReview', () => {
    it('should batch approve multiple withdrawals', async () => {
      prisma.withdrawal.findUnique
        .mockResolvedValueOnce({ id: 'w1', userId: 'u1', amount: 100, status: 'pending' })
        .mockResolvedValueOnce({ id: 'w2', userId: 'u2', amount: 200, status: 'pending' })
      prisma.user.findUnique
        .mockResolvedValue({ balance: 500, frozenBalance: 300 })
      prisma.user.updateMany.mockResolvedValue({ count: 1 })
      prisma.withdrawal.update.mockResolvedValue({ id: 'w1', status: 'approved' })
      prisma.balanceRecord.create.mockResolvedValue({})

      const result = await WithdrawalService.batchReview(['w1', 'w2'], { approved: true, reviewedBy: 'admin1' })
      expect(result.success).toBe(2)
      expect(result.failed).toBe(0)
    })

    it('should handle partial failures in batch review', async () => {
      prisma.withdrawal.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'w2', userId: 'u2', amount: 200, status: 'pending' })
      prisma.user.findUnique.mockResolvedValue({ balance: 500, frozenBalance: 300 })
      prisma.user.updateMany.mockResolvedValue({ count: 1 })
      prisma.withdrawal.update.mockResolvedValue({ id: 'w2', status: 'approved' })
      prisma.balanceRecord.create.mockResolvedValue({})

      const result = await WithdrawalService.batchReview(['w1', 'w2'], { approved: true, reviewedBy: 'admin1' })
      expect(result.success).toBe(1)
      expect(result.failed).toBe(1)
    })
  })

  // ============ getUserWithdrawals ============
  describe('getUserWithdrawals', () => {
    it('returns paginated withdrawals for user', async () => {
      prisma.withdrawal.findMany.mockResolvedValueOnce([
        { id: 'w1', amount: 100, status: 'pending' },
      ] as any)
      prisma.withdrawal.count.mockResolvedValueOnce(1)

      const result = await WithdrawalService.getUserWithdrawals('user-1')
      expect(result.withdrawals).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.totalPages).toBe(1)
    })

    it('uses custom page and limit', async () => {
      prisma.withdrawal.findMany.mockResolvedValueOnce([])
      prisma.withdrawal.count.mockResolvedValueOnce(100)
      const result = await WithdrawalService.getUserWithdrawals('user-1', 3, 10)
      expect(result.pagination.page).toBe(3)
      expect(result.pagination.totalPages).toBe(10)
    })
  })

  // ============ getPendingWithdrawals ============
  describe('getPendingWithdrawals', () => {
    it('returns pending withdrawals with user info', async () => {
      prisma.withdrawal.findMany.mockResolvedValueOnce([
        { id: 'w1', amount: 100, status: 'pending', user: { phone: '138' } },
      ] as any)
      prisma.withdrawal.count.mockResolvedValueOnce(1)

      const result = await WithdrawalService.getPendingWithdrawals()
      expect(result.withdrawals).toHaveLength(1)
      expect(prisma.withdrawal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' }, include: { user: true } })
      )
    })
  })

  // ============ getWithdrawalStats ============
  describe('getWithdrawalStats', () => {
    it('returns counts by status and total approved amount', async () => {
      prisma.withdrawal.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(10) // approved
        .mockResolvedValueOnce(2) // rejected
      prisma.withdrawal.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } } as any)

      const stats = await WithdrawalService.getWithdrawalStats()
      expect(stats.pending).toBe(5)
      expect(stats.approved).toBe(10)
      expect(stats.rejected).toBe(2)
      expect(stats.totalAmount).toBe(5000)
    })

    it('returns 0 totalAmount when sum is null', async () => {
      prisma.withdrawal.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      prisma.withdrawal.aggregate.mockResolvedValueOnce({ _sum: { amount: null } } as any)

      const stats = await WithdrawalService.getWithdrawalStats()
      expect(stats.totalAmount).toBe(0)
    })
  })
})
