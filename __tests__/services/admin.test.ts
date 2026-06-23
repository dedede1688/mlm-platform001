import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

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
    groupBy: vi.fn(),
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

import { prisma } from '@/lib/prisma'
import { AdminService } from '@/lib/services/admin.service'

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ========================================
  // settleDividends
  // ========================================
  describe('settleDividends', () => {
    it('should settle dividends for multiple users and write BalanceRecord with type=daily_dividend, sourceId=null', async () => {
      // 今日分红记录：user-1 有 2 条，user-2 有 1 条
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-1', amount: 100, dividendDate: new Date(), user: { id: 'user-1', nickname: 'Alice' } },
        { id: 'div-2', userId: 'user-1', amount: 200, dividendDate: new Date(), user: { id: 'user-1', nickname: 'Alice' } },
        { id: 'div-3', userId: 'user-2', amount: 300, dividendDate: new Date(), user: { id: 'user-2', nickname: 'Bob' } },
      ])
      // user-1: amount=300 (100+200), dividendIds=['div-1','div-2']
      // user-2: amount=300, dividendIds=['div-3']

      // 第 1 个事务 (user-1): tx.user.findUnique → tx.user.update → tx.balanceRecord.create
      // $transaction 第一次调用
      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 1000, frozenBalance: 50 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // 第 2 个事务 (user-2)
      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 2000, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await AdminService.settleDividends()

      // 返回用户数
      expect(result).toBe(2)

      // balanceRecord.create 调用 2 次
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)

      // 验证 user-1 的 balanceRecord
      const call1 = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call1.data.type).toBe('daily_dividend')
      expect(call1.data.sourceType).toBe('dividend')
      expect(call1.data.sourceId).toBeNull() // 聚合发放，sourceId=null
      expect(call1.data.amount).toBe(300) // 100 + 200
      expect(call1.data.balance).toBe(1000 + 300) // before.balance + amount
      expect(call1.data.frozenBalance).toBe(50)
      expect(call1.data.userId).toBe('user-1')

      // 验证 user-2 的 balanceRecord
      const call2 = prisma.balanceRecord.create.mock.calls[1][0]
      expect(call2.data.type).toBe('daily_dividend')
      expect(call2.data.sourceType).toBe('dividend')
      expect(call2.data.sourceId).toBeNull()
      expect(call2.data.amount).toBe(300)
      expect(call2.data.balance).toBe(2000 + 300)
      expect(call2.data.frozenBalance).toBe(0)
      expect(call2.data.userId).toBe('user-2')
    })

    it('should return 0 when no dividend records today', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([])

      const result = await AdminService.settleDividends()

      expect(result).toBe(0)
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('should throw error when user not found in transaction', async () => {
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'ghost-user', amount: 100, dividendDate: new Date(), user: { id: 'ghost-user' } },
      ])

      // user.findUnique 返回 null
      prisma.user.findUnique.mockResolvedValueOnce(null)

      // $transaction 需传播错误
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        try {
          return await fn(prisma)
        } catch (e) {
          throw e
        }
      })

      await expect(AdminService.settleDividends())
        .rejects.toThrow('用户 ghost-user 不存在')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should skip user when total amount is 0', async () => {
      // amount=0 的分红记录
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-1', amount: 0, dividendDate: new Date(), user: { id: 'user-1' } },
      ])

      // user-1 的 amount=0，if (amount > 0) 跳过，不进入事务
      const result = await AdminService.settleDividends()

      // userDividends 有 1 个用户，但 amount=0 不发放
      expect(result).toBe(1) // 返回 userDividends 的 key 数量
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })

  describe('getSystemStats', () => {
    it('should return aggregate system stats', async () => {
      prisma.user.count.mockResolvedValueOnce(100)
      prisma.order.count.mockResolvedValueOnce(50)
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: 50000 } })
      prisma.reward.aggregate.mockResolvedValueOnce({ _sum: { amount: 5000 } })
      prisma.user.groupBy.mockResolvedValueOnce([
        { level: 0, _count: { _all: 10 } },
        { level: 1, _count: { _all: 80 } },
        { level: 2, _count: { _all: 10 } },
      ])
      prisma.order.count.mockResolvedValueOnce(5)
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: 1000 } })

      const result = await AdminService.getSystemStats()

      expect(result.totalUsers).toBe(100)
      expect(result.totalOrders).toBe(50)
      expect(result.totalSales).toBe(50000)
      expect(result.totalRewards).toBe(5000)
      expect(result.usersByLevel).toEqual({ 0: 10, 1: 80, 2: 10 })
      expect(result.todayOrders).toBe(5)
      expect(result.todaySales).toBe(1000)
    })

    it('should handle null aggregate values', async () => {
      prisma.user.count.mockResolvedValueOnce(0)
      prisma.order.count.mockResolvedValueOnce(0)
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: null } })
      prisma.reward.aggregate.mockResolvedValueOnce({ _sum: { amount: null } })
      prisma.user.groupBy.mockResolvedValueOnce([])
      prisma.order.count.mockResolvedValueOnce(0)
      prisma.order.aggregate.mockResolvedValueOnce({ _sum: { payAmount: null } })

      const result = await AdminService.getSystemStats()

      expect(result.totalUsers).toBe(0)
      expect(result.totalSales).toBe(0)
      expect(result.totalRewards).toBe(0)
      expect(result.usersByLevel).toEqual({})
    })
  })

  describe('getUsers', () => {
    it('should return paginated users with default filters', async () => {
      const mockUsers = [{ id: 'u1', phone: '111' }, { id: 'u2', phone: '222' }]
      prisma.user.findMany.mockResolvedValueOnce(mockUsers)
      prisma.user.count.mockResolvedValueOnce(100)

      const result = await AdminService.getUsers(1, 20)

      expect(result.users).toEqual(mockUsers)
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 100, totalPages: 5 })
    })

    it('should apply level filter', async () => {
      prisma.user.findMany.mockResolvedValueOnce([])
      prisma.user.count.mockResolvedValueOnce(0)

      await AdminService.getUsers(1, 20, { level: 2 })

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ level: 2 }) })
      )
    })

    it('should apply search filter', async () => {
      prisma.user.findMany.mockResolvedValueOnce([])
      prisma.user.count.mockResolvedValueOnce(0)

      await AdminService.getUsers(1, 20, { search: '138' })

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { phone: { contains: '138' } },
              { nickname: { contains: '138' } },
            ],
          }),
        })
      )
    })
  })

  describe('getUserDetail', () => {
    it('should return user with referrals, orders, rewards', async () => {
      const mockDetail = { id: 'u1', phone: '111', referrals: [], orders: [], rewards: [] }
      prisma.user.findUnique.mockResolvedValueOnce(mockDetail)

      const result = await AdminService.getUserDetail('u1')

      expect(result).toEqual(mockDetail)
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        include: {
          referrals: { orderBy: { createdAt: 'desc' }, take: 10 },
          orders: { orderBy: { createdAt: 'desc' }, take: 10 },
          rewards: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      })
    })
  })

  describe('updateUserLevel', () => {
    it('should update user level and write operation log', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1 })
      prisma.user.update.mockResolvedValueOnce({ id: 'u1', level: 2 })

      const { logOperation } = await import('@/lib/utils/operation-log')
      vi.mocked(logOperation).mockResolvedValueOnce(undefined as any)

      const result = await AdminService.updateUserLevel('u1', 2, 'admin-1')

      expect(result).toEqual({ id: 'u1', level: 2 })
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { level: 2 },
      })
      expect(logOperation).toHaveBeenCalledWith({
        userId: 'admin-1',
        action: 'UPDATE',
        module: 'user',
        targetId: 'u1',
        oldValue: { level: 1 },
        newValue: { level: 2 },
      })
    })

    it('should not write log when operatorId is not provided', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1 })
      prisma.user.update.mockResolvedValueOnce({ id: 'u1', level: 2 })

      const { logOperation } = await import('@/lib/utils/operation-log')
      vi.mocked(logOperation).mockClear()

      await AdminService.updateUserLevel('u1', 2)

      expect(logOperation).not.toHaveBeenCalled()
    })
  })

  describe('updateUserStatus', () => {
    it('should update user status', async () => {
      prisma.user.update.mockResolvedValueOnce({ id: 'u1', status: 'banned' })

      const result = await AdminService.updateUserStatus('u1', 'banned')

      expect(result).toEqual({ id: 'u1', status: 'banned' })
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: 'banned' },
      })
    })
  })

  describe('getOrders', () => {
    it('should return paginated orders with user and items', async () => {
      const mockOrders = [{ id: 'o1', orderNo: 'ORD1', user: { id: 'u1' }, items: [] }]
      prisma.order.findMany.mockResolvedValueOnce(mockOrders)
      prisma.order.count.mockResolvedValueOnce(50)

      const result = await AdminService.getOrders(1, 20)

      expect(result.orders).toEqual(mockOrders)
      expect(result.pagination.total).toBe(50)
    })

    it('should apply status filter', async () => {
      prisma.order.findMany.mockResolvedValueOnce([])
      prisma.order.count.mockResolvedValueOnce(0)

      await AdminService.getOrders(1, 20, { status: 'paid' })

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'paid' }) })
      )
    })

    it('should apply search filter on orderNo', async () => {
      prisma.order.findMany.mockResolvedValueOnce([])
      prisma.order.count.mockResolvedValueOnce(0)

      await AdminService.getOrders(1, 20, { search: 'ORD123' })

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orderNo: { contains: 'ORD123' } }) })
      )
    })
  })

  describe('getRewards', () => {
    it('should return paginated rewards with user and order', async () => {
      const mockRewards = [{ id: 'r1', user: { id: 'u1' }, order: { id: 'o1' } }]
      prisma.reward.findMany.mockResolvedValueOnce(mockRewards)
      prisma.reward.count.mockResolvedValueOnce(30)

      const result = await AdminService.getRewards(1, 20)

      expect(result.rewards).toEqual(mockRewards)
      expect(result.pagination.total).toBe(30)
    })

    it('should apply filters', async () => {
      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.reward.count.mockResolvedValueOnce(0)

      await AdminService.getRewards(1, 20, {
        type: 'referral', status: 'paid', userId: 'u1',
      })

      expect(prisma.reward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'referral', status: 'paid', userId: 'u1' }),
        })
      )
    })
  })
})