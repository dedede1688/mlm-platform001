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
      // v54: 5 级独立池，每级默认 5% 分红率
      // totalOrderAmount = 20000, totalDividendPool = 20000 * 0.05 * 5 = 5000
      // 4. 符合条件用户 (level >= DIRECTOR=3, status=active)
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-director', phone: '111', nickname: 'Director', level: 3 },
        { id: 'user-manager', phone: '222', nickname: 'Manager', level: 4 },
      ])
      // 默认 include_upstream=false，每级池只分给本级用户
      // Level 3 池: 20000*0.05=1000，1 位主任 → director 1000
      // Level 4 池: 20000*0.05=1000，1 位经理 → manager 1000

      // 5. 循环内每个用户: findUnique → dividend.create → user.update → balanceRecord.create → reward.create
      // User director (level=3, dividendAmount=1000)
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0 })
      prisma.dividend.create.mockResolvedValueOnce({
        id: 'dividend-1', userId: 'user-director', orderId: 'order-1', amount: 1000, userLevel: 3, totalPool: 5000, dividendDate: new Date(),
      })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})
      prisma.reward.create.mockResolvedValueOnce({})

      // User manager (level=4, dividendAmount=1000)
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 2000, frozenBalance: 10, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0 })
      prisma.dividend.create.mockResolvedValueOnce({
        id: 'dividend-2', userId: 'user-manager', orderId: 'order-1', amount: 1000, userLevel: 4, totalPool: 5000, dividendDate: new Date(),
      })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})
      prisma.reward.create.mockResolvedValueOnce({})

      const result = await DividendService.settleDailyDividends()

      // 验证返回值
      expect(result.dividendPool).toBe(5000)
      expect(result.distributedUsers).toBe(2)
      expect(result.message).toBe('分红结算成功（v2 5级独立池）')

      // 验证 balanceRecord.create 调用 2 次
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)

      // 验证第一个用户 balanceRecord
      const call1 = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call1.data.type).toBe('daily_dividend')
      expect(call1.data.sourceType).toBe('dividend')
      expect(call1.data.sourceId).toBe('dividend-1')
      expect(call1.data.amount).toBe(1000)
      expect(call1.data.balance).toBe(1000) // before.balance + 0 (资金底座重构: balance 不变)
      expect(call1.data.frozenBalance).toBe(0)
      expect(call1.data.userId).toBe('user-director')

      // 验证第二个用户 balanceRecord
      const call2 = prisma.balanceRecord.create.mock.calls[1][0]
      expect(call2.data.type).toBe('daily_dividend')
      expect(call2.data.sourceType).toBe('dividend')
      expect(call2.data.sourceId).toBe('dividend-2')
      expect(call2.data.amount).toBe(1000)
      expect(call2.data.balance).toBe(2000) // before.balance + 0 (资金底座重构: balance 不变)
      expect(call2.data.frozenBalance).toBe(10)
      expect(call2.data.userId).toBe('user-manager')

      const update1 = prisma.user.update.mock.calls[0][0]
      const update2 = prisma.user.update.mock.calls[1][0]
      // 资金底座重构: 分红只进 earningsAvailable，不碰 balance
      expect(update1.data).toMatchObject({ earningsAvailable: { increment: 1000 } })
      expect(update1.data).not.toHaveProperty('balance')
      expect(update2.data).toMatchObject({ earningsAvailable: { increment: 1000 } })
      expect(update2.data).not.toHaveProperty('balance')
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

      expect(result.dividendPool).toBe(2500) // 10000 * 0.05 * 5
      expect(result.message).toBe('暂无符合条件的分红用户')
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    // v60.3 batch 6: 补 171-174 行 - includeUpstream=true 分支
    it('includeUpstream=true: 主任池 also 包含经理/总监/总裁 users(累加到 userTotalDividends)', async () => {
      // 让所有 *.include_upstream 都返回 true,触发 171-174 行的循环分支
      // 注意:必须用 mockImplementation + finally 还原,否则污染其他测试
      // 只让 director.include_upstream=true,manager/include_upstream 默认 false
      // 这样 director 池会包含所有 level>=3 的 user,但 manager/president 等仍独占自己的池
      const { getBusinessConfig } = await import('@/lib/config/business')
      const originalImpl = vi.mocked(getBusinessConfig).getMockImplementation()
      vi.mocked(getBusinessConfig).mockImplementation(async (key: string, defaultValue: any) => {
        if (key === 'dividend.director.include_upstream') return true
        return defaultValue
      })

      try {
        // 1. 今日未结算
        prisma.dividend.findFirst.mockResolvedValueOnce(null)
        // 2. 今日无 dividend reward
        prisma.reward.findFirst.mockResolvedValueOnce(null)
        // 3. 今日有 1 笔 paid 订单, totalOrderAmount=10000
        prisma.order.findMany.mockResolvedValueOnce([
          { id: 'order-1', payAmount: 10000, status: 'paid', paidAt: new Date() },
        ])
        // 4. 包含 director(3) + manager(4) + supervisor(5) - 都 level >= 3
        prisma.user.findMany.mockResolvedValueOnce([
          { id: 'user-director', phone: '111', nickname: 'D', level: 3 },
          { id: 'user-manager', phone: '222', nickname: 'M', level: 4 },
          { id: 'user-supervisor', phone: '333', nickname: 'S', level: 5 },
        ])
        // 全部 *.include_upstream=true 时:
        //   Level 5 池 totalOrderAmount(10000)*0.05=500 → candidates=[S,S](5,6+也包含自身),但只有 S → 500
        //   Level 4 池 → candidates=[M] → 500
        //   Level 3 池 (includeUpstream=true): candidates=[D,M,S](3,4,5) → perPerson = 500/3 ≈ 166.67
        // userTotalDividends 累加:
        //   D: 166.67 (only level 3 pool)
        //   M: 500 + 166.67 = 666.67
        //   S: 500 + 166.67 = 666.67
        // 每个 user 1 次 dividend.create

        const mockEmpty = { balance: 0, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0 }

        // D (only level 3 pool share = 500/3 ≈ 166.67)
        prisma.user.findUnique.mockResolvedValueOnce(mockEmpty)
        prisma.dividend.create.mockResolvedValueOnce({ id: 'd-1' })
        prisma.user.update.mockResolvedValueOnce({})
        prisma.balanceRecord.create.mockResolvedValueOnce({})
        prisma.reward.create.mockResolvedValueOnce({})

        // M (level 4 + level 3)
        prisma.user.findUnique.mockResolvedValueOnce(mockEmpty)
        prisma.dividend.create.mockResolvedValueOnce({ id: 'd-2' })
        prisma.user.update.mockResolvedValueOnce({})
        prisma.balanceRecord.create.mockResolvedValueOnce({})
        prisma.reward.create.mockResolvedValueOnce({})

        // S (level 5 + level 3)
        prisma.user.findUnique.mockResolvedValueOnce(mockEmpty)
        prisma.dividend.create.mockResolvedValueOnce({ id: 'd-3' })
        prisma.user.update.mockResolvedValueOnce({})
        prisma.balanceRecord.create.mockResolvedValueOnce({})
        prisma.reward.create.mockResolvedValueOnce({})

        const result = await DividendService.settleDailyDividends()

        // 验证关键调用:每个 include_upstream 都被传过
        expect(vi.mocked(getBusinessConfig)).toHaveBeenCalledWith('dividend.director.include_upstream', false)
        expect(vi.mocked(getBusinessConfig)).toHaveBeenCalledWith('dividend.manager.include_upstream', false)
        // 3 个用户,各 1 次 dividend.create
        expect(prisma.dividend.create).toHaveBeenCalledTimes(3)
        expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(3)
        expect(prisma.reward.create).toHaveBeenCalledTimes(3)
        // 验证 manager 和 supervisor 累加多池分红到同一个 record
        const managerRecord = prisma.dividend.create.mock.calls.find((c: any) => c[0].data.userId === 'user-manager')
        expect(managerRecord[0].data.amount).toBeCloseTo(666.67, 0)
        const supervisorRecord = prisma.dividend.create.mock.calls.find((c: any) => c[0].data.userId === 'user-supervisor')
        expect(supervisorRecord[0].data.amount).toBeCloseTo(666.67, 0)
        const directorRecord = prisma.dividend.create.mock.calls.find((c: any) => c[0].data.userId === 'user-director')
        expect(directorRecord[0].data.amount).toBeCloseTo(166.67, 0)
        expect(result.distributedUsers).toBe(3)
      } finally {
        // 还原 mockImplementation,避免污染后续测试
        if (originalImpl) {
          vi.mocked(getBusinessConfig).mockImplementation(originalImpl as any)
        } else {
          vi.mocked(getBusinessConfig).mockReset()
        }
      }
    })
  })

  // ============ 其他查询方法 ============
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
        { amount: 100, user: { phone: '138', nickname: 'A', level: 3 } },
        { amount: 200, user: { phone: '139', nickname: 'B', level: 4 } },
      ] as any)
      prisma.user.count.mockResolvedValueOnce(5)

      const summary = await DividendService.getTodayDividendSummary()
      expect(summary.totalAmount).toBe(300)
      expect(summary.distributedUsers).toBe(2)
      expect(summary.eligibleUsers).toBe(5)
      expect(summary.isSettled).toBe(true)
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