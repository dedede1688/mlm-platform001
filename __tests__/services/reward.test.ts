import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'

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
    reward: createMockChain(),
    dividend: createMockChain(),
    order: createMockChain(),
    balanceRecord: createMockChain(),
    operationLog: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    addUpgradeProductCount: vi.fn(),
    addDirectSales: vi.fn(),
    checkAndUpgradeLevel: vi.fn(),
  },
}))

const businessConfigValues: Record<string, any> = {
  'reward.referral_rate': 0.20,
  'reward.brand_bonus_rate': 0.20,
  'dividend.director.rate': 0.05,
  'dividend.manager.rate': 0.05,
  'dividend.supervisor.rate': 0.05,
  'dividend.president.rate': 0.05,
  'dividend.board.rate': 0.05,
  'dividend.director.include_upstream': false,
  'dividend.manager.include_upstream': false,
  'dividend.supervisor.include_upstream': false,
  'dividend.president.include_upstream': false,
  'dividend.board.include_upstream': false,
}

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (key: string, defaultValue: any) => {
    return businessConfigValues[key] !== undefined ? businessConfigValues[key] : defaultValue
  }),
  invalidateBusinessConfigCache: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { RewardService } from '@/lib/services/reward.service'
import { getBusinessConfig } from '@/lib/config/business'

describe('RewardService', () => {
  beforeEach(() => {
    // Reset all mocks (clears implementations, resolved values, etc.)
    Object.values(prisma).forEach((chain: any) => {
      if (chain && typeof chain === 'object') {
        Object.values(chain).forEach((fn: any) => {
          if (vi.isMockFunction(fn)) fn.mockReset()
        })
      }
    })
    // Restore getBusinessConfig
    ;(getBusinessConfig as any).mockImplementation(async (key: string, defaultValue: any) => {
      return businessConfigValues[key] !== undefined ? businessConfigValues[key] : defaultValue
    })
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('createReferralReward', () => {
    it('should create referral reward when referrer has upgrade product', async () => {
      const orderId = 'order-1'
      const orderAmount = 1000
      const referrerId = 'referrer-1'
      const fromUserId = 'buyer-1'
      const expectedAmount = 200

      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-1', userId: referrerId, type: 'referral', orderId, amount: expectedAmount, fromUserId, level: 1, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createReferralReward(orderId, orderAmount, referrerId, fromUserId)

      expect(prisma.reward.create).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const balanceRecordCall = prisma.balanceRecord.create.mock.calls[0][0]
      expect(balanceRecordCall.data.type).toBe('referral_reward')
      expect(balanceRecordCall.data.amount).toBe(expectedAmount)
    })

    it('should skip reward when referrer has no upgrade product', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 0 })

      await RewardService.createReferralReward('o-1', 1000, 'referrer-1', 'buyer-1')

      expect(prisma.reward.create).not.toHaveBeenCalled()
    })

    it('should skip reward when referrer not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await RewardService.createReferralReward('o-1', 1000, 'nonexistent', 'buyer-1')

      expect(prisma.reward.create).not.toHaveBeenCalled()
    })
  })

  describe('createBrandBonusReward', () => {
    it('should create brand bonus reward for placement chain distributor', async () => {
      const orderId = 'order-1'
      const orderAmount = 1000
      const buyerId = 'buyer-1'
      const referrerId = 'referrer-1'
      const expectedAmount = 200

      prisma.user.findUnique.mockResolvedValueOnce({ level: 2, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: referrerId, level: 2 })
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })

      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-b1', userId: referrerId, type: 'brand_bonus', orderId, amount: expectedAmount, fromUserId: buyerId, level: 1, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 300, frozenBalance: 10 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createBrandBonusReward(orderId, orderAmount, buyerId, referrerId)

      expect(prisma.reward.create).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('brand_bonus')
    })

    it('should return early when referrer level < DISTRIBUTOR', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1, directDistributorCount: 0 })

      await RewardService.createBrandBonusReward('o-1', 1000, 'buyer-1', 'referrer-low')

      expect(prisma.reward.create).not.toHaveBeenCalled()
    })

    it('should sink to OperationLog when no matching distributor found', async () => {
      const orderId = 'order-1'
      const orderAmount = 1000
      const buyerId = 'buyer-1'
      const referrerId = 'referrer-1'

      prisma.user.findUnique.mockResolvedValueOnce({ level: 2, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(3)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: referrerId, level: 2 })
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: 'dist-2' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'dist-2', level: 2 })
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })

      prisma.operationLog.create.mockResolvedValueOnce({})

      await RewardService.createBrandBonusReward(orderId, orderAmount, buyerId, referrerId)

      expect(prisma.operationLog.create).toHaveBeenCalledTimes(1)
      expect(prisma.reward.create).not.toHaveBeenCalled()
    })
  })

  describe('createDividendReward', () => {
    it('should create dividend rewards for eligible users with 5-level pools', async () => {
      const orderId = 'order-1'
      const orderAmount = 10000
      const buyerId = 'buyer-1'

      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'director-1', level: 1, id: buyerId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'director-1', level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'manager-1', level: 3, id: 'director-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'manager-1', level: 4 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 4, id: 'manager-1' })

      // director pool: 500 each
      prisma.dividend.create.mockResolvedValueOnce({
        id: 'div-1', userId: 'director-1', orderId, amount: 500, userLevel: 3, totalPool: 500, dividendDate: new Date(),
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 1000, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // manager pool: 500 each
      prisma.dividend.create.mockResolvedValueOnce({
        id: 'div-2', userId: 'manager-1', orderId, amount: 500, userLevel: 4, totalPool: 500, dividendDate: new Date(),
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 2000, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createDividendReward(orderId, orderAmount, buyerId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)
      for (let i = 0; i < 2; i++) {
        const call = prisma.balanceRecord.create.mock.calls[i][0]
        expect(call.data.type).toBe('dividend_reward')
        expect(call.data.sourceType).toBe('dividend')
      }
    })

    it('should return early when no eligible users (all levels < DIRECTOR)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'member-1', level: 1, id: 'buyer-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'member-1', level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'distributor-1', level: 1, id: 'member-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'distributor-1', level: 2 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 2, id: 'distributor-1' })

      await RewardService.createDividendReward('o-1', 1000, 'buyer-1')

      expect(prisma.dividend.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })

  describe('processRefund', () => {
    it('should deduct rewards and write BalanceRecord with type=refund_reward', async () => {
      const orderId = 'order-refund-1'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r1', userId: 'user-1', type: 'referral', orderId, amount: 100, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_reward')
      expect(call.data.amount).toBe(-100)
      expect(call.data.balance).toBe(400)
    })

    it('should deduct dividends and write BalanceRecord with type=refund_dividend', async () => {
      const orderId = 'order-refund-2'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d1', userId: 'user-2', orderId, amount: 50 },
      ])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 300, frozenBalance: 10 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_dividend')
      expect(call.data.amount).toBe(-50)
      expect(call.data.balance).toBe(250)
    })

    it('should throw error when user balance insufficient for reward refund', async () => {
      const orderId = 'order-refund-3'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r2', userId: 'user-3', type: 'referral', orderId, amount: 1000, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 50, frozenBalance: 0 })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('余额不足，无法扣回奖励')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should throw error when user balance insufficient for dividend refund', async () => {
      const orderId = 'order-refund-4'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d2', userId: 'user-4', orderId, amount: 500 },
      ])

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 100, frozenBalance: 0 })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('余额不足，无法扣回分红')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should handle both rewards and dividends in single transaction', async () => {
      const orderId = 'order-refund-5'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r3', userId: 'user-5', type: 'brand_bonus', orderId, amount: 30, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d3', userId: 'user-5', orderId, amount: 20 },
      ])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 200, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 170, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)
      expect(prisma.balanceRecord.create.mock.calls[0][0].data.type).toBe('refund_reward')
      expect(prisma.balanceRecord.create.mock.calls[1][0].data.type).toBe('refund_dividend')
    })

    it('should do nothing when no rewards or dividends found', async () => {
      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      await RewardService.processRefund('order-empty')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  })
})
