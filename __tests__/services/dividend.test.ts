import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
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

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { DividendService } from '@/lib/services/dividend.service'

describe('DividendService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ========================================
  // snapshotDailyDividends（每日快照，不入账）
  // ========================================
  describe('snapshotDailyDividends', () => {
    it('should create dividend records (settled=false) without updating balance or creating rewards', async () => {
      // 1. 今日未快照
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      // 2. 今日有 paid 订单
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: 20000 }, _count: { id: 2 } })
      prisma.order.findFirst.mockResolvedValueOnce({ id: 'order-latest' })
      // totalOrderAmount = 20000, totalDividendPool = 20000 * 0.05 * 5 = 5000
      // 3. 符合条件用户
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-director', phone: '111', nickname: 'Director', level: 3 },
        { id: 'user-manager', phone: '222', nickname: 'Manager', level: 4 },
      ])
      // 默认 include_upstream=false：Level 3 池 1000→director, Level 4 池 1000→manager

      // dividend.createMany 被调用 1 次，含 2 条数据
      prisma.dividend.createMany.mockResolvedValueOnce({ count: 2 })

      const result = await DividendService.snapshotDailyDividends()

      // 验证返回值
      expect(result.dividendPool).toBe(5000)
      expect(result.distributedUsers).toBe(2)
      expect(result.message).toContain('分红快照成功')

      // 关键：只创建 dividend 记录，不更新余额、不写流水、不发奖励
      expect(prisma.dividend.createMany).toHaveBeenCalledTimes(1)
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
      expect(prisma.reward.create).not.toHaveBeenCalled()

      // 验证 dividend 记录 settled=false
      const call1 = prisma.dividend.createMany.mock.calls[0][0]
      expect(call1.data).toHaveLength(2)
      expect(call1.data[0].settled).toBe(false)
      expect(call1.data[0].userId).toBe('user-director')
      expect(call1.data[0].amount).toBe(1000)
    })

    it('should throw error when already snapshotted today', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce({ id: 'existing' })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        try { return await fn(prisma) } catch (e) { throw e }
      })

      await expect(DividendService.snapshotDailyDividends())
        .rejects.toThrow('今日分红已快照，不可重复生成')

      expect(prisma.dividend.create).not.toHaveBeenCalled()
    })

    it('should return early when no paid orders', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: 0 }, _count: { id: 0 } })
      prisma.order.findFirst.mockResolvedValueOnce(null)

      const result = await DividendService.snapshotDailyDividends()

      expect(result.dividendPool).toBe(0)
      expect(result.message).toBe('今日无分红池金额')
      expect(prisma.dividend.create).not.toHaveBeenCalled()
    })

    it('should return early when no eligible users', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: 10000 }, _count: { id: 1 } })
      prisma.order.findFirst.mockResolvedValueOnce({ id: 'order-1' })
      prisma.user.findMany.mockResolvedValueOnce([])

      const result = await DividendService.snapshotDailyDividends()

      expect(result.dividendPool).toBe(2500) // 10000 * 0.05 * 5
      expect(result.message).toBe('暂无符合条件的分红用户')
      expect(prisma.dividend.create).not.toHaveBeenCalled()
    })

    it('includeUpstream=true: 主任池 also includes higher levels', async () => {
      const { getBusinessConfig } = await import('@/lib/config/business')
      const originalImpl = vi.mocked(getBusinessConfig).getMockImplementation()
      vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
        if (key === 'dividend.director.include_upstream') return true
        return defaultValue
      })

      try {
        prisma.dividend.findFirst.mockResolvedValueOnce(null)
        prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: 10000 }, _count: { id: 1 } })
        prisma.order.findFirst.mockResolvedValueOnce({ id: 'order-1' })
        prisma.user.findMany.mockResolvedValueOnce([
          { id: 'user-director', phone: '111', nickname: 'D', level: 3 },
          { id: 'user-manager', phone: '222', nickname: 'M', level: 4 },
          { id: 'user-supervisor', phone: '333', nickname: 'S', level: 5 },
        ])

        prisma.dividend.createMany.mockResolvedValueOnce({ count: 3 })

        const result = await DividendService.snapshotDailyDividends()

        expect(prisma.dividend.createMany).toHaveBeenCalledTimes(1)
        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(prisma.reward.create).not.toHaveBeenCalled()

        const createManyData = prisma.dividend.createMany.mock.calls[0][0].data
        const managerRecord = createManyData.find((d: any) => d.userId === 'user-manager')
        expect(managerRecord.amount).toBeCloseTo(666.67, 0)
        const directorRecord = createManyData.find((d: any) => d.userId === 'user-director')
        expect(directorRecord.amount).toBeCloseTo(166.67, 0)
        expect(result.distributedUsers).toBe(3)
      } finally {
        if (originalImpl) {
          vi.mocked(getBusinessConfig).mockImplementation(originalImpl as any)
        } else {
          vi.mocked(getBusinessConfig).mockReset()
        }
      }
    })
  })

  // ========================================
  // settleWeeklyDividends（每周入账，幂等）
  // ========================================
  describe('settleWeeklyDividends - Batch 3A-1 紧急暂停', () => {
    it('returns an explicit paused result before opening a transaction', async () => {
      const result = await DividendService.settleWeeklyDividends()

      expect(result).toEqual({
        paused: true,
        batchId: null,
        totalAmount: 0,
        totalDividends: 0,
        distributedUsers: 0,
        details: [],
        message: '分红结算维护中，当前未执行任何资金操作',
      })
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('performs no fund, ledger, reward, or settlement writes while paused', async () => {
      await DividendService.settleWeeklyDividends()

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.user.updateMany).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
      expect(prisma.reward.create).not.toHaveBeenCalled()
      expect(prisma.reward.createMany).not.toHaveBeenCalled()
      expect(prisma.dividend.update).not.toHaveBeenCalled()
      expect(prisma.dividend.updateMany).not.toHaveBeenCalled()
    })
  })

  // ============ 查询方法 ============
  describe('getUserDividends', () => {
    it('returns paginated dividends', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'd1', amount: 100 },
        { id: 'd2', amount: 200 },
      ] as any)
      prisma.dividend.count.mockResolvedValueOnce(2)

      const result = await DividendService.getUserDividends('user-1', 1, 20)

      expect(result.dividends).toHaveLength(2)
      expect(result.pagination.total).toBe(2)
      expect(result.pagination.totalPages).toBe(1)
    })

    it('uses custom page and limit', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([])
      prisma.dividend.count.mockResolvedValueOnce(100)
      const result = await DividendService.getUserDividends('user-1', 3, 10)
      expect(result.pagination.page).toBe(3)
      expect(result.pagination.limit).toBe(10)
      expect(result.pagination.totalPages).toBe(10)
    })
  })

  describe('getDividendStats', () => {
    it('throws when user not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)
      await expect(DividendService.getDividendStats('user-x'))
        .rejects.toThrow('用户不存在')
    })

    it('returns totalAmount, lastAmount, totalCount', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' } as any)
      prisma.dividend.aggregate.mockResolvedValueOnce({ _sum: { amount: 500 } } as any)
      prisma.dividend.findFirst.mockResolvedValueOnce({ dividendDate: new Date('2026-07-01'), amount: 200 } as any)
      prisma.dividend.count.mockResolvedValueOnce(3)

      const stats = await DividendService.getDividendStats('user-1')
      expect(stats.totalAmount).toBe(500)
      expect(stats.lastAmount).toBe(200)
      expect(stats.totalCount).toBe(3)
    })

    it('handles zero sum and no last dividend', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' } as any)
      prisma.dividend.aggregate.mockResolvedValueOnce({ _sum: { amount: null } } as any)
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.dividend.count.mockResolvedValueOnce(0)

      const stats = await DividendService.getDividendStats('user-1')
      expect(stats.totalAmount).toBe(0)
      expect(stats.lastDividendDate).toBeNull()
      expect(stats.lastAmount).toBe(0)
    })
  })

  describe('checkTodaySettlement', () => {
    it('returns true when today settlement exists', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce({ id: 'd1' } as any)
      const result = await DividendService.checkTodaySettlement()
      expect(result).toBe(true)
    })

    it('returns false when no today settlement', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      const result = await DividendService.checkTodaySettlement()
      expect(result).toBe(false)
    })
  })

  describe('getTodayDividendSummary', () => {
    it('returns summary with today dividends and eligible users count', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([
        { amount: 100, settled: false, user: { phone: '138', nickname: 'A', level: 3 } },
        { amount: 200, settled: true, user: { phone: '139', nickname: 'B', level: 4 } },
      ] as any)
      prisma.user.count.mockResolvedValueOnce(5)

      const summary = await DividendService.getTodayDividendSummary()
      expect(summary.totalAmount).toBe(300)
      expect(summary.distributedUsers).toBe(2)
      expect(summary.eligibleUsers).toBe(5)
      expect(summary.isSettled).toBe(true)
      expect(summary.isSnapshotted).toBe(true)
      expect(summary.settledCount).toBe(1)
      expect(summary.unsettledCount).toBe(1)
    })

    it('returns isSettled=false when no today dividends', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([])
      prisma.user.count.mockResolvedValueOnce(10)

      const summary = await DividendService.getTodayDividendSummary()
      expect(summary.totalAmount).toBe(0)
      expect(summary.distributedUsers).toBe(0)
      expect(summary.isSettled).toBe(false)
    })
  })
})
