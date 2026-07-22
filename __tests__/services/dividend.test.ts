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
      prisma.order.findMany.mockResolvedValueOnce([
        { id: 'order-1', payAmount: 10000, status: 'paid', paidAt: new Date() },
        { id: 'order-2', payAmount: 10000, status: 'paid', paidAt: new Date() },
      ])
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
      prisma.order.findMany.mockResolvedValueOnce([])

      const result = await DividendService.snapshotDailyDividends()

      expect(result.dividendPool).toBe(0)
      expect(result.message).toBe('今日无分红池金额')
      expect(prisma.dividend.create).not.toHaveBeenCalled()
    })

    it('should return early when no eligible users', async () => {
      prisma.dividend.findFirst.mockResolvedValueOnce(null)
      prisma.order.findMany.mockResolvedValueOnce([
        { id: 'order-1', payAmount: 10000, status: 'paid', paidAt: new Date() },
      ])
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
        prisma.order.findMany.mockResolvedValueOnce([
          { id: 'order-1', payAmount: 10000, status: 'paid', paidAt: new Date() },
        ])
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
  describe('settleWeeklyDividends', () => {
    it('should settle unsettled dividends: update earningsAvailable, create balanceRecord, create rewards, mark settled', async () => {
      // 1. 2 条未结算分红（同一用户 user-1）
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-1', orderId: 'order-1', amount: 600 },
        { id: 'div-2', userId: 'user-1', orderId: 'order-2', amount: 400 },
      ])

      // 2. 用户当前余额（findMany 预取）
      prisma.user.findMany.mockResolvedValueOnce([{
        id: 'user-1', balance: 1000, frozenBalance: 50,
        consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0,
      }])

      // 3. mock 副作用
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })
      prisma.reward.createMany.mockResolvedValueOnce({ count: 2 })
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 2 })

      const result = await DividendService.settleWeeklyDividends()

      // 验证返回值
      expect(result.batchId).toBeTruthy()
      expect(result.totalAmount).toBe(1000)
      expect(result.totalDividends).toBe(2)
      expect(result.distributedUsers).toBe(1)
      expect(result.message).toContain('周结分红入账成功')

      // 验证 user.update：earningsAvailable += 1000，不碰 balance
      const updateCall = prisma.user.update.mock.calls[0][0]
      expect(updateCall.data.earningsAvailable).toEqual({ increment: 1000 })
      expect(updateCall.data).not.toHaveProperty('balance')

      // 验证 balanceRecord.createMany：1 条汇总记录
      const brCall = prisma.balanceRecord.createMany.mock.calls[0][0]
      expect(brCall.data).toHaveLength(1)
      expect(brCall.data[0].type).toBe('daily_dividend')
      expect(brCall.data[0].sourceType).toBe('dividend')
      expect(brCall.data[0].amount).toBe(1000)
      expect(brCall.data[0].userId).toBe('user-1')

      // 验证 reward.createMany：2 条
      expect(prisma.reward.createMany).toHaveBeenCalledTimes(1)
      const rData = prisma.reward.createMany.mock.calls[0][0].data
      expect(rData).toHaveLength(2)
      expect(rData[0].type).toBe('dividend')
      expect(rData[0].status).toBe('paid')
      expect(rData[0].amount).toBe(600)
      expect(rData[0].orderId).toBe('order-1')
      expect(rData[1].amount).toBe(400)
      expect(rData[1].orderId).toBe('order-2')

      // 验证 dividend.updateMany：循环外一次调用，标记为 settled
      const dmCall = prisma.dividend.updateMany.mock.calls[0][0]
      expect(dmCall.data.settled).toBe(true)
      expect(dmCall.data.settleBatchId).toBeTruthy()
      expect(dmCall.data.settleDate).toBeTruthy()
      expect(dmCall.where.id.in).toEqual(['div-1', 'div-2'])
    })

    it('should settle dividends for multiple users separately', async () => {
      // 2 个用户，各 1 条未结算
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-1', orderId: 'order-1', amount: 500 },
        { id: 'div-2', userId: 'user-2', orderId: 'order-2', amount: 300 },
      ])

      // findMany 预取两个用户
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
        { id: 'user-2', balance: 2000, frozenBalance: 10, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])

      prisma.user.update.mockResolvedValue({})
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 2 })
      prisma.reward.createMany.mockResolvedValueOnce({ count: 2 })
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 2 })

      const result = await DividendService.settleWeeklyDividends()

      expect(result.totalAmount).toBe(800)
      expect(result.distributedUsers).toBe(2)
      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
      expect(prisma.reward.createMany).toHaveBeenCalledTimes(1)
      expect(prisma.dividend.updateMany).toHaveBeenCalledTimes(1)
    })

    it('should return early when no unsettled dividends (idempotent)', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([])

      const result = await DividendService.settleWeeklyDividends()

      expect(result.batchId).toBeNull()
      expect(result.totalAmount).toBe(0)
      expect(result.totalDividends).toBe(0)
      expect(result.distributedUsers).toBe(0)
      expect(result.message).toBe('无待结算的分红明细')
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
      expect(prisma.reward.create).not.toHaveBeenCalled()
    })

    it('should skip user when not found', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'ghost-user', orderId: 'order-1', amount: 500 },
      ])

      // findMany 预取 → 空数组（用户不存在）
      prisma.user.findMany.mockResolvedValueOnce([])

      const result = await DividendService.settleWeeklyDividends()

      expect(result.distributedUsers).toBe(0)
      expect(result.totalAmount).toBe(0)
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    })

    it('should skip dividends with total amount 0', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-1', orderId: 'order-1', amount: 0 },
      ])
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', balance: 0, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])

      const result = await DividendService.settleWeeklyDividends()

      // userTotal=0, 跳过 continue
      expect(result.distributedUsers).toBe(0)
      expect(result.totalAmount).toBe(0)
      expect(prisma.user.update).not.toHaveBeenCalled()
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
