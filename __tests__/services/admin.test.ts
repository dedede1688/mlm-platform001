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