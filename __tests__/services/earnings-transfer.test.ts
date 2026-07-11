import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })

  const mockPrisma: any = {
    user: createMockChain(),
    balanceRecord: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

import { prisma } from '@/lib/prisma'
import { EarningsTransferService } from '@/lib/services/earnings-transfer.service'

describe('EarningsTransferService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.user.findUnique.mockReset()
    prisma.user.updateMany.mockReset()
    prisma.balanceRecord.create.mockReset()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('正常转入成功', () => {
    it('earningsAvailable 减少、balance 增加、BalanceRecord 写入、其他字段不变', async () => {
      const userId = 'user-1'
      const amount = 100

      // 第一次 findUnique（校验阶段）
      prisma.user.findUnique.mockResolvedValueOnce({
        id: userId,
        balance: 500,
        earningsAvailable: 300,
        frozenBalance: 0,
        consumeBalance: 500,
        earningsPending: 0,
        earningsVoided: 0,
        earningsFrozen: 0,
      })

      // updateMany 成功
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })

      // 第二次 findUnique（事务内重新查询）
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 600,
        frozenBalance: 0,
        earningsAvailable: 200,
      })

      // balanceRecord.create
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await EarningsTransferService.transferToBalance(userId, amount)

      // 验证返回值
      expect(result.userId).toBe(userId)
      expect(result.amount).toBe(amount)
      expect(result.balance).toBe(600)
      expect(result.earningsAvailable).toBe(200)

      // 验证 updateMany 防并发
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: userId,
          earningsAvailable: { gte: amount },
        },
        data: {
          earningsAvailable: { decrement: amount },
          balance: { increment: amount },
        },
      })

      // 验证 BalanceRecord 写入
      expect(prisma.balanceRecord.create).toHaveBeenCalledWith({
        data: {
          userId,
          type: 'earnings_to_balance',
          amount,
          balance: 600,
          frozenBalance: 0,
          sourceType: 'earnings_transfer',
          sourceId: userId,
          description: `收益转入购物余额 ¥${amount.toFixed(2)}`,
        },
      })
    })
  })

  describe('amount 校验', () => {
    it('amount 为 0 报错', async () => {
      await expect(EarningsTransferService.transferToBalance('user-1', 0))
        .rejects.toThrow('转入金额必须为有效数字且大于0')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('amount 为负数报错', async () => {
      await expect(EarningsTransferService.transferToBalance('user-1', -50))
        .rejects.toThrow('转入金额必须为有效数字且大于0')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('amount 为字符串报错', async () => {
      await expect(EarningsTransferService.transferToBalance('user-1', '100' as any))
        .rejects.toThrow('转入金额必须为有效数字且大于0')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('amount 为 NaN 报错', async () => {
      await expect(EarningsTransferService.transferToBalance('user-1', NaN))
        .rejects.toThrow('转入金额必须为有效数字且大于0')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })

    it('amount 为 Infinity 报错', async () => {
      await expect(EarningsTransferService.transferToBalance('user-1', Infinity))
        .rejects.toThrow('转入金额必须为有效数字且大于0')
      expect(prisma.user.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('用户不存在', () => {
    it('用户不存在时抛错', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await expect(EarningsTransferService.transferToBalance('nonexistent', 100))
        .rejects.toThrow('用户不存在')
    })
  })

  describe('可用收益不足', () => {
    it('earningsAvailable < amount 时抛错', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        balance: 100,
        earningsAvailable: 50,
        frozenBalance: 0,
        consumeBalance: 100,
        earningsPending: 0,
        earningsVoided: 0,
        earningsFrozen: 0,
      })

      await expect(EarningsTransferService.transferToBalance('user-1', 100))
        .rejects.toThrow('可用收益不足')
    })
  })

  describe('并发保护', () => {
    it('updateMany count = 0 时抛错', async () => {
      // 第一次 findUnique（校验阶段）— 有足够收益
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        balance: 100,
        earningsAvailable: 200,
        frozenBalance: 0,
        consumeBalance: 100,
        earningsPending: 0,
        earningsVoided: 0,
        earningsFrozen: 0,
      })

      // updateMany 返回 count=0（并发时已被扣减）
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(EarningsTransferService.transferToBalance('user-1', 100))
        .rejects.toThrow('可用收益不足或状态已变更')

      // 验证 BalanceRecord 没有写入
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })
})
