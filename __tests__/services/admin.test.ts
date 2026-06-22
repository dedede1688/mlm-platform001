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
})