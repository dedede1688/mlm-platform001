import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })

  const mockPrisma: any = {
    user: createMockChain(),
    reward: createMockChain(),
    dividend: createMockChain(),
    order: createMockChain(),
    balanceRecord: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (_key: string, defaultValue: any) => defaultValue),
  invalidateBusinessConfigCache: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { DividendService } from '@/lib/services/dividend.service'

describe('DividendService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ========================================
  // settleDailyDividends
  // ========================================
  describe('settleDailyDividends', () => {
    it('should settle dividends for multiple eligible users and write BalanceRecord with type=daily_dividend', async () => {
      // 1. 今日未结算
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      // 2. 今日无 dividend reward
      prisma.reward.findFirst.mockResolvedValueOnce(null)
      // 3. 今日有 paid 订单
      prisma.order.findMany.mockResolvedValueOnce([
        { id: 'order-1', payAmount: 10000, status: 'paid', paidAt: new Date() },
        { id: 'order-2', payAmount: 10000, status: 'paid', paidAt: new Date() },
      ])
      // totalOrderAmount = 20000, dividendPool = 20000 * 0.05 = 1000
      // 4. 符合条件用户 (level >= DIRECTOR=3, status=active)
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-director', phone: '111', nickname: 'Director', level: 3 },
        { id: 'user-manager', phone: '222', nickname: 'Manager', level: 4 },
      ])
      // DIVIDEND_LEVELS = [3, 4, 5, 6, 7]
      // levelCounts: {3: 1, 4: 1}
      // Level 3: countAbove=2, share=500, cumulative=500 → director 每人 500
      // Level 4: countAbove=1, share=1000, cumulative=1500 → manager 每人 1500

      // 5. 循环内每个用户: findUnique → dividend.create → user.update → balanceRecord.create → reward.create
      // User director (level=3, dividendAmount=500)
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 1000, frozenBalance: 0 })
      prisma.dividend.create.mockResolvedValueOnce({
        id: 'dividend-1', userId: 'user-director', orderId: 'order-1', amount: 500, userLevel: 3, totalPool: 1000, dividendDate: new Date(),
      })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})
      prisma.reward.create.mockResolvedValueOnce({})

      // User manager (level=4, dividendAmount=1500)
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 2000, frozenBalance: 10 })
      prisma.dividend.create.mockResolvedValueOnce({
        id: 'dividend-2', userId: 'user-manager', orderId: 'order-1', amount: 1500, userLevel: 4, totalPool: 1000, dividendDate: new Date(),
      })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})
      prisma.reward.create.mockResolvedValueOnce({})

      const result = await DividendService.settleDailyDividends()

      // 验证返回值
      expect(result.dividendPool).toBe(1000)
      expect(result.distributedUsers).toBe(2)
      expect(result.message).toBe('分红结算成功')

      // 验证 balanceRecord.create 调用 2 次
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)

      // 验证第一个用户 balanceRecord
      const call1 = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call1.data.type).toBe('daily_dividend')
      expect(call1.data.sourceType).toBe('dividend')
      expect(call1.data.sourceId).toBe('dividend-1')
      expect(call1.data.amount).toBe(500)
      expect(call1.data.balance).toBe(1000 + 500) // before.balance + amount
      expect(call1.data.frozenBalance).toBe(0)
      expect(call1.data.userId).toBe('user-director')

      // 验证第二个用户 balanceRecord
      const call2 = prisma.balanceRecord.create.mock.calls[1][0]
      expect(call2.data.type).toBe('daily_dividend')
      expect(call2.data.sourceType).toBe('dividend')
      expect(call2.data.sourceId).toBe('dividend-2')
      expect(call2.data.amount).toBe(1500)
      expect(call2.data.balance).toBe(2000 + 1500)
      expect(call2.data.frozenBalance).toBe(10)
      expect(call2.data.userId).toBe('user-manager')
    })

    it('should throw error when dividends already settled today', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce({ id: 'existing-dividend' })

      // $transaction 需传播错误
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        try {
          return await fn(prisma)
        } catch (e) {
          throw e
        }
      })

      await expect(DividendService.settleDailyDividends())
        .rejects.toThrow('今日分红已结算，不可重复结算')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should throw error when dividend rewards already exist today', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.reward.findFirst.mockResolvedValueOnce({ id: 'existing-reward' })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        try {
          return await fn(prisma)
        } catch (e) {
          throw e
        }
      })

      await expect(DividendService.settleDailyDividends())
        .rejects.toThrow('今日分红奖励已发放，不可重复发放')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should return early when no paid orders (dividendPool=0)', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.reward.findFirst.mockResolvedValueOnce(null)
      prisma.order.findMany.mockResolvedValueOnce([]) // 无 paid 订单

      const result = await DividendService.settleDailyDividends()

      expect(result.dividendPool).toBe(0)
      expect(result.message).toBe('今日无分红池金额')
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should return early when no eligible users', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.reward.findFirst.mockResolvedValueOnce(null)
      prisma.order.findMany.mockResolvedValueOnce([
        { id: 'order-1', payAmount: 10000, status: 'paid', paidAt: new Date() },
      ])
      prisma.user.findMany.mockResolvedValueOnce([]) // 无符合条件用户

      const result = await DividendService.settleDailyDividends()

      expect(result.dividendPool).toBe(500) // 10000 * 0.05
      expect(result.message).toBe('暂无符合条件的分红用户')
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })
})