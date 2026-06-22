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
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

import { prisma } from '@/lib/prisma'
import { WithdrawalService } from '@/lib/services/withdrawal.service'

describe('WithdrawalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('createWithdrawal', () => {
    it('should create withdrawal successfully with sufficient balance', async () => {
      // 事务外：用户存在 + 余额够
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 1000, frozenBalance: 0,
      })
      // 事务内：updateMany 成功扣减
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      // 事务内：创建提现记录
      prisma.withdrawal.create.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      // 事务内：写 BalanceRecord
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.createWithdrawal('u1', 100)
      expect(result).toBeDefined()
      expect(result.amount).toBe(100)
      expect(result.status).toBe('pending')
    })

    it('should throw error with insufficient balance', async () => {
      // 用户存在但余额不够
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', balance: 100, frozenBalance: 0,
      })

      await expect(WithdrawalService.createWithdrawal('u1', 10000))
        .rejects.toThrow('余额不足')
    })

    it('should throw error with non-positive amount', async () => {
      await expect(WithdrawalService.createWithdrawal('u1', 0))
        .rejects.toThrow('提现金额必须大于0')
      
      await expect(WithdrawalService.createWithdrawal('u1', -100))
        .rejects.toThrow('提现金额必须大于0')
    })
  })

  describe('reviewWithdrawal', () => {
    it('should approve withdrawal and decrease frozenBalance', async () => {
      // 事务外：查提现记录
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      // 事务内：查用户余额
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 500, frozenBalance: 100,
      })
      // 事务内：原子扣减 frozenBalance
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      // 事务内：更新提现状态
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'approved',
      })
      // 事务内：写 BalanceRecord
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.reviewWithdrawal('w1', true)
      expect(result.status).toBe('approved')
    })

    it('should reject withdrawal and refund balance', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1', userId: 'u1', amount: 100, status: 'pending',
      })
      // 事务内：查用户余额
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 500, frozenBalance: 100,
      })
      // 事务内：原子退回余额 + 扣减冻结余额
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      // 事务内：更新提现状态
      prisma.withdrawal.update.mockResolvedValueOnce({
        id: 'w1', status: 'rejected',
      })
      // 事务内：写 BalanceRecord
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const result = await WithdrawalService.reviewWithdrawal('w1', false, '信息不完整')
      expect(result.status).toBe('rejected')
    })

    it('should throw error when withdrawal not found', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce(null)

      await expect(WithdrawalService.reviewWithdrawal('w-nonexistent', true))
        .rejects.toThrow('提现记录不存在')
    })

    it('should throw error when withdrawal already processed', async () => {
      prisma.withdrawal.findUnique.mockResolvedValueOnce({
        id: 'w1',
        userId: 'u1',
        amount: 100,
        status: 'approved', // Already processed
      })

      await expect(WithdrawalService.reviewWithdrawal('w1', true))
        .rejects.toThrow('提现记录已处理')
    })
  })
})
