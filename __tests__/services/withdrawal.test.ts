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

  // v60.3 batch 6: 补 withdrawal.service.ts 9 个 throw 路径 + 4 个 falsy branch
  describe('createWithdrawal - error paths', () => {
    it('throws "用户不存在" when user not found (line 34)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)
      await expect(
        WithdrawalService.createWithdrawal('u-nonexistent', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('用户不存在')
    })

    it('throws "请先设置支付密码" when paymentPasswordHash not set (line 36)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0, paymentPasswordHash: null,
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('请先设置支付密码')
    })

    it('throws "最低提现金额" when amount < minAmount (line 43)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0, paymentPasswordHash: 'h',
      })
      // getBusinessConfig 默认 minAmount=10
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 1, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('最低提现金额')
    })

    it('throws "每日最多提现" when daily limit exceeded (line 55)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0, paymentPasswordHash: 'h',
      })
      // withdrawal.count 返回已达上限
      prisma.withdrawal.count.mockResolvedValueOnce(5)
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('每日最多提现')
    })

    it('throws "余额不足" when balance check count=0 (line 69)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0, paymentPasswordHash: 'h',
      })
      // updateMany 返回 count=0 (并发透支)
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('余额不足')
    })
  })

  describe('reviewWithdrawal approve - error paths', () => {
    it('throws "用户不存在" when user not found (line 117)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      await expect(
        WithdrawalService.reviewWithdrawal('w1', { approved: true })
      ).rejects.toThrow('用户不存在')
    })

    it('throws "冻结余额不足" when count=0 (line 123)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0 })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        WithdrawalService.reviewWithdrawal('w1', { approved: true, reviewedBy: 'admin1' })
      ).rejects.toThrow('冻结余额不足')
    })

    it('reviewedBy undefined → null in update (line 129 branch 1)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.withdrawal.update.mockResolvedValueOnce({ id: 'w1', status: 'approved' })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // 不传 reviewedBy
      await WithdrawalService.reviewWithdrawal('w1', { approved: true })

      expect(prisma.withdrawal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewedBy: null,
          }),
        })
      )
    })
  })

  describe('reviewWithdrawal reject - error paths', () => {
    it('throws "用户不存在" when user not found (line 173)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce(null)
      await expect(
        WithdrawalService.reviewWithdrawal('w1', { approved: false })
      ).rejects.toThrow('用户不存在')
    })

    it('throws "冻结余额不足" when count=0 (line 182)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0 })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        WithdrawalService.reviewWithdrawal('w1', { approved: false, reviewedBy: 'admin1', rejectReason: 'info' })
      ).rejects.toThrow('冻结余额不足')
    })

    it('reviewedBy undefined + rejectReason undefined → null defaults (lines 188, 205)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.withdrawal.update.mockResolvedValueOnce({ id: 'w1', status: 'rejected' })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // 不传 reviewedBy 和 rejectReason
      await WithdrawalService.reviewWithdrawal('w1', { approved: false })

      expect(prisma.withdrawal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewedBy: null,
            // 注意:rejectReason 没传时直接是 undefined(非 '') - service 189 行直接传递,不兜底
            rejectTemplateId: null,
            remark: null,
          }),
        })
      )
    })
  })

  describe('batchReview - error message fallback (line 241)', () => {
    it('uses "未知错误" when error has no message', async () => {
      // 第 1 个 withdrawal 抛错 - error 没有 message
      prisma.withdrawal.findUnique.mockImplementationOnce(() => {
        throw {}  // 没有 message 字段
      })

      const result = await WithdrawalService.batchReview(['w-bad'], { approved: true })

      expect(result.failed).toBe(1)
      expect(result.errors[0].error).toBe('未知错误')
    })
  })
})
