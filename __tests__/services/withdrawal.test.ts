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

  // ============ createWithdrawal ============
  describe('createWithdrawal', () => {
    it('should create withdrawal successfully with sufficient earningsAvailable', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'hashed-pwd',
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

      // 验证扣减 earningsAvailable，增加 earningsFrozen，balance 不变
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1', earningsAvailable: { gte: 100 } },
          data: {
            earningsAvailable: { decrement: 100 },
            earningsFrozen: { increment: 100 },
          },
        })
      )
    })

    it('should throw "可提现收益不足" when earningsAvailable < amount', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 10000, frozenBalance: 0,
        earningsAvailable: 50, earningsFrozen: 0,
        paymentPasswordHash: 'hashed-pwd',
      })

      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: 100, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })).rejects.toThrow('可提现收益不足')
    })

    it('should throw "可提现收益不足" when updateMany count=0 (concurrent)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
      })).rejects.toThrow('可提现收益不足')
    })

    it('should throw error with non-positive amount', async () => {
      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: 0, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })).rejects.toThrow('提现金额必须大于0')
      
      await expect(WithdrawalService.createWithdrawal('u1', {
        amount: -100, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })).rejects.toThrow('提现金额必须大于0')
    })

    it('throws "用户不存在" when user not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)
      await expect(
        WithdrawalService.createWithdrawal('u-nonexistent', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('用户不存在')
    })

    it('throws "请先设置支付密码" when paymentPasswordHash not set', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: null,
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('请先设置支付密码')
    })

    it('throws "最低提现金额" when amount < minAmount', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 1, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('最低提现金额')
    })

    it('throws "单笔最高提现金额" when amount > maxAmount', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 100000, frozenBalance: 0,
        earningsAvailable: 100000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 60000, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('单笔最高提现金额')
    })

    it('throws "每日最多提现" when daily limit exceeded', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      prisma.withdrawal.count.mockResolvedValueOnce(5)
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('每日最多提现')
    })

    it('throws "请选择收款方式" when paymentMethod missing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: '', accountNumber: 'a', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('请选择收款方式')
    })

    it('throws "请输入收款账号" when accountNumber missing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: '', accountName: 'n', paymentPassword: '123456',
        })
      ).rejects.toThrow('请输入收款账号')
    })

    it('throws "请输入收款人姓名" when accountName missing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
        earningsAvailable: 1000, earningsFrozen: 0,
        paymentPasswordHash: 'h',
      })
      await expect(
        WithdrawalService.createWithdrawal('u1', {
          amount: 100, paymentMethod: 'alipay', accountNumber: 'a', accountName: '', paymentPassword: '123456',
        })
      ).rejects.toThrow('请输入收款人姓名')
    })

    it('balance 不变：BalanceRecord 写入时 balance 等于 user.balance', async () => {
      const mockUser = {
        id: 'u1', balance: 500, frozenBalance: 200,
        earningsAvailable: 1000, earningsFrozen: 100,
        paymentPasswordHash: 'h',
      }
      prisma.user.findUnique.mockResolvedValueOnce(mockUser)
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.withdrawal.create.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.createWithdrawal('u1', {
        amount: 100, paymentMethod: 'alipay', accountNumber: '123', accountName: 'test', paymentPassword: '123456',
      })

      // 验证 balanceRecord 写入时 balance 保持不变
      expect(prisma.balanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance: 500, // user.balance 不变
            frozenBalance: 200, // user.frozenBalance 不变
          }),
        })
      )
    })
  })

  // ============ reviewWithdrawal approve ============
  describe('reviewWithdrawal approve', () => {
    it('should approve withdrawal: pending → approved', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'approved',
      })

      const result = await WithdrawalService.reviewWithdrawal('w1', { approved: true, reviewedBy: 'admin1' })
      expect(result.status).toBe('approved')
    })

    it('approve 不扣 earningsFrozen（不调用 user.updateMany）', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'approved',
      })

      await WithdrawalService.reviewWithdrawal('w1', { approved: true, reviewedBy: 'admin1' })

      // approve 不应该调 user.updateMany
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })

    it('approve 不写 paidAt', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'approved',
      })

      await WithdrawalService.reviewWithdrawal('w1', { approved: true, reviewedBy: 'admin1' })

      // 验证 withdrawal.update 的 data 不含 paidAt
      const updateCall = prisma.withdrawal.update.mock.calls[0][0]
      expect(updateCall.data).not.toHaveProperty('paidAt')
    })

    it('approve 不写 BalanceRecord（资金流水不被污染）', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'approved',
      })

      await WithdrawalService.reviewWithdrawal('w1', { approved: true, reviewedBy: 'admin1' })

      // approve 不应该写 balanceRecord
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('reviewedBy undefined → null in update', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.withdrawal.update.mockResolvedValueOnce({ id: 'w1', status: 'approved' })

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

  // ============ reviewWithdrawal reject ============
  describe('reviewWithdrawal reject', () => {
    it('should reject withdrawal: pending → rejected', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'rejected',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.reviewWithdrawal('w1', { approved: false, reviewedBy: 'admin1', rejectReason: '信息不完整' })
      expect(result.status).toBe('rejected')
    })

    it('reject 退回 earningsFrozen → earningsAvailable（不退 balance）', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'rejected',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.reviewWithdrawal('w1', { approved: false, reviewedBy: 'admin1', rejectReason: 'info' })

      // 验证 user.updateMany 只动 earningsFrozen 和 earningsAvailable，不碰 balance
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1', earningsFrozen: { gte: 100 } },
          data: {
            earningsFrozen: { decrement: 100 },
            earningsAvailable: { increment: 100 },
          },
        })
      )
    })

    it('reject 时 balance 不变', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'rejected',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.reviewWithdrawal('w1', { approved: false, reviewedBy: 'admin1', rejectReason: 'info' })

      // balanceRecord 中 balance = user.balance（不变）
      expect(prisma.balanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance: 500,
          }),
        })
      )
    })

    it('throws "冻结收益不足" when earningsFrozen < amount', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        WithdrawalService.reviewWithdrawal('w1', { approved: false, reviewedBy: 'admin1', rejectReason: 'info' })
      ).rejects.toThrow('冻结收益不足')
    })

    it('reviewedBy undefined + rejectReason undefined → null defaults', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({ id: 'w1', status: 'rejected' })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.reviewWithdrawal('w1', { approved: false })

      expect(prisma.withdrawal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewedBy: null,
            rejectTemplateId: null,
            remark: null,
          }),
        })
      )
    })
  })

  // ============ reviewWithdrawal - error paths ============
  describe('reviewWithdrawal - error paths', () => {
    it('throws "提现记录不存在" when withdrawal not found', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce(null)

      await expect(WithdrawalService.reviewWithdrawal('w-nonexistent', { approved: true }))
        .rejects.toThrow('提现记录不存在')
    })

    it('throws "提现记录已处理" when withdrawal already processed', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })

      await expect(WithdrawalService.reviewWithdrawal('w1', { approved: true }))
        .rejects.toThrow('提现记录已处理')
    })
  })

  // ============ completeWithdrawal ============
  describe('completeWithdrawal', () => {
    it('should complete withdrawal: approved → completed', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'completed', paidAt: new Date(),
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.completeWithdrawal('w1', {
        completedBy: 'admin1',
        paymentProofUrl: 'https://example.com/proof.png',
      })
      expect(result.status).toBe('completed')
    })

    it('complete 扣减 earningsFrozen', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'completed', paidAt: new Date(),
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.completeWithdrawal('w1', {
        completedBy: 'admin1',
        paymentProofUrl: 'https://example.com/proof.png',
      })

      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1', earningsFrozen: { gte: 100 } },
          data: {
            earningsFrozen: { decrement: 100 },
          },
        })
      )
    })

    it('complete 写入 paidAt / completedAt / completedBy / paymentProofUrl', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'completed',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.completeWithdrawal('w1', {
        completedBy: 'admin1',
        paymentProofUrl: 'https://example.com/proof.png',
        remark: 'test remark',
      })

      const updateCall = prisma.withdrawal.update.mock.calls[0][0]
      expect(updateCall.data.status).toBe('completed')
      expect(updateCall.data.paidAt).toBeInstanceOf(Date)
      expect(updateCall.data.completedAt).toBeInstanceOf(Date)
      expect(updateCall.data.completedBy).toBe('admin1')
      expect(updateCall.data.paymentProofUrl).toBe('https://example.com/proof.png')
      expect(updateCall.data.remark).toBe('test remark')
    })

    it('complete 时 balance 不变', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'completed',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.completeWithdrawal('w1', {
        completedBy: 'admin1',
        paymentProofUrl: 'https://example.com/proof.png',
      })

      expect(prisma.balanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance: 500,
          }),
        })
      )
    })

    it('complete 发送 withdrawal_completed 通知', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 100 })
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'completed',
      })
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await WithdrawalService.completeWithdrawal('w1', {
        completedBy: 'admin1',
        paymentProofUrl: 'https://example.com/proof.png',
      })

      // 验证通知服务被调用
      const { NotificationService } = await import('@/lib/services/notification.service')
      expect(NotificationService.sendWithdrawalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'withdrawal_completed',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      )
    })
  })

  // ============ completeWithdrawal - error paths ============
  describe('completeWithdrawal - error paths', () => {
    it('throws "打款凭证不能为空" when paymentProofUrl missing', async () => {
      await expect(
        WithdrawalService.completeWithdrawal('w1', {
          completedBy: 'admin1',
          paymentProofUrl: '',
        })
      ).rejects.toThrow('打款凭证不能为空')
    })

    it('throws "打款凭证不能为空" when paymentProofUrl is whitespace', async () => {
      await expect(
        WithdrawalService.completeWithdrawal('w1', {
          completedBy: 'admin1',
          paymentProofUrl: '   ',
        })
      ).rejects.toThrow('打款凭证不能为空')
    })

    it('throws "提现记录不存在" when withdrawal not found', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce(null)

      await expect(
        WithdrawalService.completeWithdrawal('w-nonexistent', {
          completedBy: 'admin1',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('提现记录不存在')
    })

    it('throws when status is pending (cannot complete)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })

      await expect(
        WithdrawalService.completeWithdrawal('w1', {
          completedBy: 'admin1',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('只有已审核通过的提现才能完成打款')
    })

    it('throws when status is rejected (cannot complete)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'rejected',
      })

      await expect(
        WithdrawalService.completeWithdrawal('w1', {
          completedBy: 'admin1',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('只有已审核通过的提现才能完成打款')
    })

    it('throws when status is already completed (cannot re-complete)', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'completed',
      })

      await expect(
        WithdrawalService.completeWithdrawal('w1', {
          completedBy: 'admin1',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('只有已审核通过的提现才能完成打款')
    })

    it('throws "冻结收益不足" when earningsFrozen < amount', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'approved',
      })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(
        WithdrawalService.completeWithdrawal('w1', {
          completedBy: 'admin1',
          paymentProofUrl: 'https://example.com/proof.png',
        })
      ).rejects.toThrow('冻结收益不足，无法完成打款')
    })
  })

  // ============ batchReview ============
  describe('batchReview', () => {
    it('should batch approve multiple withdrawals', async () => {
      prisma.withdrawal.findUnique
        .mockResolvedValueOnce({ id: 'w1', userId: 'u1', amount: 100, status: 'pending' })
        .mockResolvedValueOnce({ id: 'w2', userId: 'u2', amount: 200, status: 'pending' })
      prisma.withdrawal.update.mockResolvedValue({ id: 'w1', status: 'approved' })

      const result = await WithdrawalService.batchReview(['w1', 'w2'], { approved: true, reviewedBy: 'admin1' })
      expect(result.success).toBe(2)
      expect(result.failed).toBe(0)
    })

    it('should handle partial failures in batch review', async () => {
      prisma.withdrawal.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'w2', userId: 'u2', amount: 200, status: 'pending' })
      prisma.withdrawal.update.mockResolvedValue({ id: 'w2', status: 'approved' })

      const result = await WithdrawalService.batchReview(['w1', 'w2'], { approved: true, reviewedBy: 'admin1' })
      expect(result.success).toBe(1)
      expect(result.failed).toBe(1)
    })

    it('uses "未知错误" when error has no message', async () => {
      prisma.withdrawal.findUnique.mockImplementationOnce(() => {
        throw {}
      })

      const result = await WithdrawalService.batchReview(['w-bad'], { approved: true })

      expect(result.failed).toBe(1)
      expect(result.errors[0].error).toBe('未知错误')
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
    it('returns counts by status and total completed amount', async () => {
      prisma.withdrawal.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(10) // approved
        .mockResolvedValueOnce(2) // rejected
        .mockResolvedValueOnce(8) // completed
      prisma.withdrawal.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } } as any)

      const stats = await WithdrawalService.getWithdrawalStats()
      expect(stats.pending).toBe(5)
      expect(stats.approved).toBe(10)
      expect(stats.rejected).toBe(2)
      expect(stats.completed).toBe(8)
      expect(stats.totalAmount).toBe(5000)
    })

    it('returns 0 totalAmount when sum is null', async () => {
      prisma.withdrawal.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      prisma.withdrawal.aggregate.mockResolvedValueOnce({ _sum: { amount: null } } as any)

      const stats = await WithdrawalService.getWithdrawalStats()
      expect(stats.totalAmount).toBe(0)
    })
  })
})
