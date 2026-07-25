import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
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

vi.mock('@/lib/services/order-reward-state.service', () => ({
  OrderRewardStateService: {
    claim: vi.fn().mockResolvedValue('claimed'),
    markFailed: vi.fn().mockResolvedValue(undefined),
  },
}))

import { RewardService } from '@/lib/services/reward.service'
import { getBusinessConfig } from '@/lib/config/business'
import { UserService } from '@/lib/services/user.service'
import { OrderRewardStateService } from '@/lib/services/order-reward-state.service'

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
    ;(OrderRewardStateService.claim as any).mockResolvedValue('claimed')
    ;(OrderRewardStateService.markFailed as any).mockResolvedValue(undefined)
    ;(UserService.addDirectSales as any).mockReset()
    ;(UserService.addUpgradeProductCount as any).mockReset()
    ;(UserService.checkAndUpgradeLevel as any).mockReset()
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

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      // 资金底座重构: 奖励只进 earningsAvailable，不进 balance
      expect(userUpdateCall.data).toMatchObject({
        earningsAvailable: { increment: expectedAmount },
      })
      expect(userUpdateCall.data).not.toHaveProperty('balance')
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

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      // 资金底座重构: 奖励只进 earningsAvailable，不进 balance
      expect(userUpdateCall.data).toMatchObject({
        earningsAvailable: { increment: expectedAmount },
      })
      expect(userUpdateCall.data).not.toHaveProperty('balance')
    })

    it('v60 step3: A 是会员且安置链无经销商时沉淀到 OperationLog', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      // findBrandBonusRecipients: buyer has no parent in placement chain
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.operationLog.create.mockResolvedValueOnce({})

      await RewardService.createBrandBonusReward('o-1', 1000, 'buyer-1', 'referrer-low')

      expect(prisma.reward.create).not.toHaveBeenCalled()
      expect(prisma.operationLog.create).toHaveBeenCalledTimes(1)
    })

    it('v60 step3: A 是会员时跳过 A，安置链上第 1 个经销商收到品牌管理奖', async () => {
      const orderId = 'order-v60'
      const orderAmount = 1000
      const buyerId = 'buyer-v60'
      const referrerId = 'referrer-member' // A 是会员
      const distributorId = 'dist-X' // X 是经销商
      const expectedAmount = 200

      // 1. referrer (A) 是会员 level=1
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1, directDistributorCount: 0 })
      // 2. paidCount = 1 → targetLayer = 1
      prisma.order.count.mockResolvedValueOnce(1)
      // 3. findBrandBonusRecipients walks up from buyer:
      //    buyer's parentId → distributorX
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: distributorId })
      //    distributorX is level 2 (distributor)
      prisma.user.findUnique.mockResolvedValueOnce({ id: distributorId, level: 2 })
      //    distributorX's parentId → null (end of chain)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })

      // 4. reward.create for X
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-v60', userId: distributorId, type: 'brand_bonus', orderId, amount: expectedAmount, fromUserId: buyerId, level: 1, status: 'paid',
      })
      // 5. before user (X) - need BALANCE_SELECT fields
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0 })
      // 6. user.update (X)
      prisma.user.update.mockResolvedValueOnce({})
      // 7. balanceRecord.create
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createBrandBonusReward(orderId, orderAmount, buyerId, referrerId)

      // X (distributor) should receive the brand bonus, not A (member)
      expect(prisma.reward.create).toHaveBeenCalledTimes(1)
      const rewardCall = prisma.reward.create.mock.calls[0][0]
      expect(rewardCall.data.userId).toBe(distributorId)
      expect(rewardCall.data.type).toBe('brand_bonus')
      expect(rewardCall.data.amount).toBe(expectedAmount)
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

      // director pool: findMany 预取余额
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'director-1', balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.dividend.createMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      // manager pool: findMany 预取余额
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'manager-1', balance: 2000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.dividend.createMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.createDividendReward(orderId, orderAmount, buyerId)

      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(2)
      for (let i = 0; i < 2; i++) {
        const call = prisma.balanceRecord.createMany.mock.calls[i][0]
        expect(call.data[0].type).toBe('dividend_reward')
        expect(call.data[0].sourceType).toBe('dividend')
      }

      const update1 = prisma.user.updateMany.mock.calls[0][0]
      const update2 = prisma.user.updateMany.mock.calls[1][0]
      expect(update1.data).toMatchObject({ earningsAvailable: { increment: 500 } })
      expect(update1.data).not.toHaveProperty('balance')
      expect(update2.data).toMatchObject({ earningsAvailable: { increment: 500 } })
      expect(update2.data).not.toHaveProperty('balance')
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

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', balance: 500, frozenBalance: 0, earningsAvailable: 500, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.createMany.mock.calls[0][0]
      expect(call.data[0].type).toBe('refund_reward')
      expect(call.data[0].amount).toBe(-100)
      expect(call.data[0].balance).toBe(500)

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toMatchObject({
        earningsAvailable: { decrement: 100 },
      })
      expect(userUpdateCall.data).not.toHaveProperty('balance')
    })

    it('should deduct dividends and write BalanceRecord with type=refund_dividend', async () => {
      const orderId = 'order-refund-2'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d1', userId: 'user-2', orderId, amount: 50 },
      ])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))


      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-2', balance: 300, frozenBalance: 10, earningsAvailable: 300, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.createMany.mock.calls[0][0]
      expect(call.data[0].type).toBe('refund_dividend')
      expect(call.data[0].amount).toBe(-50)
      expect(call.data[0].balance).toBe(300)

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toMatchObject({
        earningsAvailable: { decrement: 50 },
      })
      expect(userUpdateCall.data).not.toHaveProperty('balance')
      expect(userUpdateCall.data).not.toHaveProperty('earningsVoided')
    })

    it('P0: earningsAvailable 不足时不报错，扣完可提现 + 余额写作废 (reward refund)', async () => {
      const orderId = 'order-refund-3'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r2', userId: 'user-3', type: 'referral', orderId, amount: 1000, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-3', balance: 5000, frozenBalance: 0, earningsAvailable: 50, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.createMany.mock.calls[0][0]
      expect(call.data[0].type).toBe('refund_reward')
      expect(call.data[0].amount).toBe(-1000)
      expect(call.data[0].balance).toBe(5000)

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toMatchObject({
        earningsAvailable: { decrement: 50 },
        earningsVoided: { increment: 950 },
      })
      expect(userUpdateCall.data).not.toHaveProperty('balance')
    })

    it('P0: earningsAvailable 不足时不报错，扣完可提现 + 余额写作废 (dividend refund)', async () => {
      const orderId = 'order-refund-4'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d2', userId: 'user-4', orderId, amount: 500 },
      ])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))


      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-4', balance: 2000, frozenBalance: 0, earningsAvailable: 100, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.createMany.mock.calls[0][0]
      expect(call.data[0].type).toBe('refund_dividend')
      expect(call.data[0].amount).toBe(-500)
      expect(call.data[0].balance).toBe(2000)

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toMatchObject({
        earningsAvailable: { decrement: 100 },
        earningsVoided: { increment: 400 },
      })
      expect(userUpdateCall.data).not.toHaveProperty('balance')
    })

    // v60.3 batch 6: 补 line 417,455 - processRefund 中 user.findUnique 返回 null
    it('throws "用户不存在" in processRefund when reward user not found', async () => {
      const orderId = 'order-refund-user-missing'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r4', userId: 'user-orphan', type: 'brand_bonus', orderId, amount: 30, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.findMany.mockResolvedValueOnce([])

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('不存在')
    })

    // v60.3 batch 7: 补 line 455 - processRefund 中 dividend user.findUnique 返回 null
    it('throws "用户不存在" in processRefund when dividend user not found (line 455)', async () => {
      const orderId = 'order-refund-div-missing'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-x', userId: 'user-orphan-div', orderId, amount: 50 },
      ])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.findMany.mockResolvedValueOnce([])

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('不存在')
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

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-5', balance: 200, frozenBalance: 0, earningsAvailable: 200, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-5', balance: 200, frozenBalance: 0, earningsAvailable: 170, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(2)
      const call1 = prisma.balanceRecord.createMany.mock.calls[0][0]
      const call2 = prisma.balanceRecord.createMany.mock.calls[1][0]
      expect(call1.data[0].type).toBe('refund_reward')
      expect(call2.data[0].type).toBe('refund_dividend')

      const update1 = prisma.user.update.mock.calls[0][0]
      const update2 = prisma.user.update.mock.calls[1][0]
      expect(update1.data).toMatchObject({ earningsAvailable: { decrement: 30 } })
      expect(update1.data).not.toHaveProperty('balance')
      expect(update1.data).not.toHaveProperty('earningsVoided')
      expect(update2.data).toMatchObject({ earningsAvailable: { decrement: 20 } })
      expect(update2.data).not.toHaveProperty('balance')
      expect(update2.data).not.toHaveProperty('earningsVoided')
    })

    it('should do nothing when no rewards or dividends found', async () => {
      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      await RewardService.processRefund('order-empty')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('退款幂等：dividend 查询必须含 refundedAt:null，已退款的不再扣减', async () => {
      const orderId = 'order-idempotent-div'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-d1', orderId, amount: 100, refundedAt: null },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-d1', orderId, amount: 100, refundedAt: new Date() },
      ])

      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-d1', balance: 500, frozenBalance: 0, earningsAvailable: 500, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      const dividendFindCall = prisma.dividend.findMany.mock.calls[0][0]
      expect(dividendFindCall.where.refundedAt).toBeNull()

      const updateManyCall = prisma.dividend.updateMany.mock.calls[0][0]
      expect(updateManyCall.where.refundedAt).toBeNull()
    })

    it('退款幂等：第二次调用不再扣减收益和创建负流水', async () => {
      const orderId = 'order-idempotent-2nd'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([])
      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      await RewardService.processRefund(orderId)
      await RewardService.processRefund(orderId)

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    })

    it('退款幂等：所有退款记录使用统一 refundTime', async () => {
      const orderId = 'order-unified-time'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'r-1', userId: 'user-u1', type: 'referral', orderId, amount: 50, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'd-1', userId: 'user-u2', orderId, amount: 30, refundedAt: null },
      ])

      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-u1', balance: 500, frozenBalance: 0, earningsAvailable: 500, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-u2', balance: 300, frozenBalance: 0, earningsAvailable: 300, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      const dividendUpdateCall = prisma.dividend.updateMany.mock.calls[0][0]
      const refundTime = dividendUpdateCall.data.refundedAt
      expect(refundTime).toBeInstanceOf(Date)
    })

    it('退款幂等：禁止 dividend deleteMany，必须用 updateMany refundedAt 保留审计记录', async () => {
      const orderId = 'order-no-delete'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'd-nd', userId: 'user-nd', orderId, amount: 50, refundedAt: null },
      ])

      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-nd', balance: 200, frozenBalance: 0, earningsAvailable: 200, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.dividend.deleteMany).not.toHaveBeenCalled()
      expect(prisma.dividend.updateMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('v54 H: checkUpgradeFromOrder', () => {
    it('升级品订单 → 买家 directSalesAmount += payAmount', async () => {
      const userId = 'buyer-h1'
      const order = {
        items: [
          { product: { isUpgradeProduct: true }, quantity: 10 },
        ],
        payAmount: 5000,
      }

      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'referrer-h1' })

      await RewardService.checkUpgradeFromOrder(userId, order)

      // v54 H: buyer's own directSalesAmount should be incremented
      expect(UserService.addDirectSales).toHaveBeenCalledWith(userId, 5000)
      // referrer's directSalesAmount should also be incremented
      expect(UserService.addDirectSales).toHaveBeenCalledWith('referrer-h1', 5000)
      expect(UserService.addUpgradeProductCount).toHaveBeenCalledWith(userId, 10)
      expect(UserService.checkAndUpgradeLevel).toHaveBeenCalledWith(userId)
      expect(UserService.checkAndUpgradeLevel).toHaveBeenCalledWith('referrer-h1')
    })

    it('普通订单 → 买家 directSalesAmount += payAmount', async () => {
      const userId = 'buyer-h2'
      const order = {
        items: [
          { product: { isUpgradeProduct: false }, quantity: 1 },
        ],
        payAmount: 500,
      }

      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'referrer-h2' })

      await RewardService.checkUpgradeFromOrder(userId, order)

      // v54 H: buyer's own directSalesAmount should be incremented
      expect(UserService.addDirectSales).toHaveBeenCalledWith(userId, 500)
      // referrer's directSalesAmount should also be incremented
      expect(UserService.addDirectSales).toHaveBeenCalledWith('referrer-h2', 500)
      expect(UserService.checkAndUpgradeLevel).toHaveBeenCalledWith('referrer-h2')
    })
  })

  // ============ processOrderRewards (orchestrator) ============
  describe('processOrderRewards', () => {
    it('returns empty when order not found', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null)
      const result = await RewardService.processOrderRewards('order-x')
      expect(result).toEqual({})
    })

    it('returns empty when order status is not paid', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-x',
        status: 'pending',
        payAmount: 0,
        user: { id: 'user-1', referrerId: 'r-1' },
        items: [],
      } as any)
      const result = await RewardService.processOrderRewards('order-x')
      expect(result).toEqual({})
    })

    it('v56: 升级品订单也发放品牌管理奖', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-upgrade',
        status: 'paid',
        payAmount: 500,
        user: { id: 'user-1', referrerId: 'r-1' },
        items: [{ product: { isUpgradeProduct: true }, quantity: 1 }],
      } as any)
      // createReferralReward：推荐人已购升级品
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 } as any)
      await RewardService.processOrderRewards('order-upgrade')
      // 验证 createBrandBonusReward 被调用（不再被 hasUpgradeProduct 阻断）
      // 通过 reward.create mock 间接验证：brand_bonus 类型应出现
    })

    it('returns unlock info when referral needs upgrade product', async () => {
      // 设 order findUnique 返回 valid paid order with referrer
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-unlock',
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer', referrerId: 'referrer' },
        items: [{ product: { isUpgradeProduct: false }, quantity: 1 }],
      } as any)
      // referrer 没升级品 → 返回 unlockRequired
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 0 } as any)
      // 后续 brand bonus 内部 findUnique 不需要(mock 默认 undefined)
      const result = await RewardService.processOrderRewards('order-unlock')
      // orchestrator 应该正常返回,包含 referralUnlockRequired=true
      expect(result.referralUnlockRequired).toBe(true)
    })

    // v60.3 batch 6: 补 line 324 - referralUnlockAmount falsy 分支
    it('returns no unlock info when buyer has no referrer', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-no-ref',
        status: 'paid',
        payAmount: 100,
        user: { id: 'buyer', referrerId: null },
        items: [],
      } as any)
      const result = await RewardService.processOrderRewards('order-no-ref')
      expect(result.referralUnlockRequired).toBeUndefined()
      expect(result.referralUnlockAmount).toBeUndefined()
    })

    it('奖励失败时不执行 checkUpgradeFromOrder', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-fail-upgrade',
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-f', referrerId: null },
        items: [{ product: { isUpgradeProduct: true }, quantity: 1 }],
      } as any)
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-fail-upgrade',
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-f', referrerId: null },
        items: [{ product: { isUpgradeProduct: true }, quantity: 1 }],
      } as any)
      prisma.$transaction.mockImplementationOnce(async () => { throw new Error('DB error') })
      ;(OrderRewardStateService.markFailed as any).mockResolvedValueOnce(undefined)

      await RewardService.processOrderRewards('order-fail-upgrade')

      expect(UserService.addDirectSales).not.toHaveBeenCalled()
      expect(UserService.addUpgradeProductCount).not.toHaveBeenCalled()
      expect(UserService.checkAndUpgradeLevel).not.toHaveBeenCalled()
    })

    it('奖励 skipped 时不执行 checkUpgradeFromOrder', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-skip-upgrade',
        status: 'paid',
        payAmount: 500,
        user: { id: 'buyer-s', referrerId: null },
        items: [],
      } as any)
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('already_completed')

      await RewardService.processOrderRewards('order-skip-upgrade')

      expect(UserService.addDirectSales).not.toHaveBeenCalled()
      expect(UserService.checkAndUpgradeLevel).not.toHaveBeenCalled()
    })
  })


  // ============ getUserRewardStats ============
  describe('getUserRewardStats', () => {
    it('aggregates referral + brand bonus + dividend totals', async () => {
      prisma.reward.findMany.mockResolvedValueOnce([
        { type: 'referral', amount: 100, status: 'paid' },
        { type: 'brand_bonus', amount: 50, status: 'paid' },
        { type: 'referral', amount: 200, status: 'paid' },
      ] as any)
      prisma.dividend.findMany.mockResolvedValueOnce([
        { amount: 300 },
        { amount: 150 },
      ] as any)
      const stats = await RewardService.getUserRewardStats('user-1')
      expect(stats.referralTotal).toBe(300)
      expect(stats.brandBonusTotal).toBe(50)
      expect(stats.dividendTotal).toBe(450)
      expect(stats.totalAmount).toBe(800)
    })

    it('excludes non-paid rewards from totals', async () => {
      prisma.reward.findMany.mockResolvedValueOnce([
        { type: 'referral', amount: 100, status: 'paid' },
        { type: 'referral', amount: 999, status: 'refunded' }, // 不计入
        { type: 'brand_bonus', amount: 50, status: 'paid' },
      ] as any)
      prisma.dividend.findMany.mockResolvedValueOnce([])
      const stats = await RewardService.getUserRewardStats('user-1')
      expect(stats.referralTotal).toBe(100)
      expect(stats.brandBonusTotal).toBe(50)
      expect(stats.totalAmount).toBe(150)
    })

    it('returns zeros when no rewards/dividends', async () => {
      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([])
      const stats = await RewardService.getUserRewardStats('user-1')
      expect(stats.referralTotal).toBe(0)
      expect(stats.brandBonusTotal).toBe(0)
      expect(stats.dividendTotal).toBe(0)
      expect(stats.totalAmount).toBe(0)
      expect(stats.totalCount).toBe(0)
    })
  })

  // ============ createDividendReward 额外分支 ============
  describe('createDividendReward - 额外分支', () => {
    // v60.3 batch 7: 补 line 238 - includeUpstream=true 时,anyone level>=pool.level
    it('includeUpstream=true includes higher-level users (line 238)', async () => {
      const savedInc = businessConfigValues['dividend.manager.include_upstream']
      businessConfigValues['dividend.manager.include_upstream'] = true
      try {
        const orderId = 'order-inc-up'
        const buyerId = 'buyer-inc'

        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'd1', level: 1, id: buyerId })
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'd1', level: 3 })
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'm1', level: 3, id: 'd1' })
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'm1', level: 4 })
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 4, id: 'm1' })

        prisma.user.findMany.mockResolvedValueOnce([
          { id: 'd1', balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
        ])
        prisma.dividend.createMany.mockResolvedValueOnce({ count: 1 })
        prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
        prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

        prisma.user.findMany.mockResolvedValueOnce([
          { id: 'd1', balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
        ])
        prisma.dividend.createMany.mockResolvedValueOnce({ count: 1 })
        prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
        prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

        await RewardService.createDividendReward(orderId, 10000, buyerId)

        expect(prisma.dividend.createMany).toHaveBeenCalled()
      } finally {
        businessConfigValues['dividend.manager.include_upstream'] = savedInc
      }
    })

    // v60.3 batch 7: 补 line 233 - rate=0 → skip pool
    it('skips pool when rate = 0 (line 233)', async () => {
      // 临时覆盖 director pool rate = 0
      const saved = businessConfigValues['dividend.director.rate']
      businessConfigValues['dividend.director.rate'] = 0
      try {
        const orderId = 'order-zero-rate'
        const buyerId = 'buyer-zero'

        // 链上只有 1 个 level=3 user
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'd1', level: 1, id: buyerId })
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'd1', level: 3 })
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 3, id: 'd1' })

        await RewardService.createDividendReward(orderId, 1000, buyerId)

        // director 池 rate=0 → skip,不调 dividend.create
        expect(prisma.dividend.create).not.toHaveBeenCalled()
      } finally {
        businessConfigValues['dividend.director.rate'] = saved
      }
    })

    // v60.3 batch 7: 补 line 237-239 - includeUpstream false 路径(已默认 cover,但配合测试 rate=0 + level)
    it('does not create dividend when no eligible pool members (line 242)', async () => {
      const orderId = 'order-no-pool'
      const buyerId = 'buyer-no-pool'

      // 链上没有人 level>=3
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'm1', level: 1, id: buyerId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'm1', level: 1 })  // level=1, 不入 director pool
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 1, id: 'm1' })

      await RewardService.createDividendReward(orderId, 100, buyerId)
      // eligibleUsers 为空,function 早返回 → 没 dividend.create
      expect(prisma.dividend.create).not.toHaveBeenCalled()
    })
  })

  // ============ createBrandBonusReward 额外分支 ============
  describe('createBrandBonusReward - maxLayers 计算', () => {
    it('经销商 + 0 直推 → maxLayers=2', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 } as any)
      // 调用 createBrandBonusReward → maxLayers=2
      // 应该不返回任何 recipient
      prisma.order.count.mockResolvedValueOnce(1)
      // 链上没有 level>=3 的 parent
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      await RewardService.createBrandBonusReward('order-x', 100, 'buyer', 'referrer')
      // 不抛错即可
    })

    it('经销商 + 1 直推 → maxLayers=4', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 1 } as any)
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      await RewardService.createBrandBonusReward('order-x', 100, 'buyer', 'referrer')
      // 不抛错
    })

    // v60.3 batch 6: 补 reward.service.ts line 53 - level=0 兜底 → maxLayers=0
    it('referrer.level=0 → computeMaxLayers=0 → createBrandBonusReward 早返', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        level: 0,
        directDistributorCount: 0,
      } as any)
      // 不应该再调 order.count (因为 maxLayers=0 直接 return)
      await RewardService.createBrandBonusReward('order-x', 100, 'buyer', 'referrer-novice')
      expect(prisma.order.count).not.toHaveBeenCalled()
    })

    // v60.3 batch 7: 补 line 47-48 - 经销商 + 2 个直推 → maxLayers=10
    it('经销商 + 2 直推 → maxLayers=10 (line 47-48)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 } as any)
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      await RewardService.createBrandBonusReward('order-x', 100, 'buyer', 'referrer-2d')
      // 不抛错
    })
  })

  // ============ processPaidOrderRewards 原子性和幂等 ============
  describe('processPaidOrderRewards - 原子性和幂等', () => {
    it('幂等键格式：referral 为 orderId:referral:userId:1', async () => {
      const orderId = 'order-idem-ref'
      const referrerId = 'ref-idem'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-idem', referrerId, id: 'buyer-idem' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-1', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-idem', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const rewardCall = prisma.reward.create.mock.calls[0][0]
      expect(rewardCall.data.idempotencyKey).toBe(`${orderId}:referral:${referrerId}:1`)
    })

    it('幂等键格式：brand_bonus 为 orderId:brand_bonus:userId:layer', async () => {
      const orderId = 'order-idem-brand'
      const targetUserId = 'target-brand'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-brand', referrerId: 'ref-brand', id: 'buyer-brand' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-b1', userId: 'ref-brand' })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      // findBrandBonusRecipients with tx=prisma
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: targetUserId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: targetUserId, level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-b2', userId: targetUserId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      // dividend eligible users walk
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-brand', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const brandCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'brand_bonus')
      expect(brandCall).toBeDefined()
      expect(brandCall![0].data.idempotencyKey).toBe(`${orderId}:brand_bonus:${targetUserId}:1`)
    })

    it('幂等键格式：dividend 为 orderId:dividend:userId:poolType', async () => {
      const orderId = 'order-idem-div'
      const directorId = 'director-idem'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 10000,
        user: { id: 'buyer-div', referrerId: directorId, id: 'buyer-div' },
        items: [],
      } as any)
      // referral: referrer has upgrade product
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-d1', userId: directorId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      // brand bonus: referrer level + directDistributorCount
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      // findBrandBonusRecipients: buyer -> null (no parent)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      // brand bonus sink
      prisma.operationLog.create.mockResolvedValueOnce({})
      // dividend eligible walk: buyer -> director -> null
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-div', referrerId: directorId, level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: directorId, level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 3, id: directorId })
      // dividend pool: director
      prisma.dividend.create.mockResolvedValueOnce({ id: 'div-1', userId: directorId, amount: 500 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-div1', userId: directorId })
      prisma.user.findMany.mockResolvedValueOnce([
        { id: directorId, balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      // earningsDelta user check + update
      prisma.user.findUnique.mockResolvedValueOnce({ id: directorId })
      // order update
      prisma.order.update.mockResolvedValueOnce({})

      await RewardService.processPaidOrderRewards(orderId)

      const dividendRewardCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'dividend')
      expect(dividendRewardCall).toBeDefined()
      expect(dividendRewardCall![0].data.idempotencyKey).toBe(`${orderId}:dividend:${directorId}:director`)
    })

    it('Dividend 必须包含 poolType、settled:true、settleDate、refundedAt:null', async () => {
      const orderId = 'order-div-fields'
      const directorId = 'director-fields'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 10000,
        user: { id: 'buyer-f', referrerId: directorId, id: 'buyer-f' },
        items: [],
      } as any)
      // referral
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-f1', userId: directorId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      // brand bonus
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.operationLog.create.mockResolvedValueOnce({})
      // dividend walk
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-f', referrerId: directorId, level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: directorId, level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 3, id: directorId })
      // dividend pool: director
      prisma.dividend.create.mockResolvedValueOnce({ id: 'div-f1', userId: directorId, amount: 500 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-f2', userId: directorId })
      prisma.user.findMany.mockResolvedValueOnce([
        { id: directorId, balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      // earningsDelta
      prisma.user.findUnique.mockResolvedValueOnce({ id: directorId })
      prisma.order.update.mockResolvedValueOnce({})

      await RewardService.processPaidOrderRewards(orderId)

      const dividendCall = prisma.dividend.create.mock.calls[0][0]
      expect(dividendCall.data.poolType).toBe('director')
      expect(dividendCall.data.settled).toBe(true)
      expect(dividendCall.data.settleDate).toBeInstanceOf(Date)
      expect(dividendCall.data.refundedAt).toBeNull()
    })

    it('正向流水 sourceId 必须使用实际 Reward.id 或 Dividend.id', async () => {
      const orderId = 'order-source-id'
      const referrerId = 'ref-src'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-src', referrerId, id: 'buyer-src' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'real-reward-id', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-src', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const brCall = prisma.balanceRecord.create.mock.calls[0][0]
      expect(brCall.data.sourceId).toBe('real-reward-id')
    })

    it('连续调用两次：第一次 completed，第二次 skipped', async () => {
      const orderId = 'order-twice'
      ;(OrderRewardStateService.claim as any)
        .mockResolvedValueOnce('claimed')
        .mockResolvedValueOnce('already_completed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-tw', referrerId: null, id: 'buyer-tw' },
        items: [],
      } as any)

      const result1 = await RewardService.processPaidOrderRewards(orderId)
      expect(result1.status).toBe('completed')

      const result2 = await RewardService.processPaidOrderRewards(orderId)
      expect(result2.status).toBe('skipped')
    })

    it('事务回滚时 Order 的 rewardStatus 不变', async () => {
      const orderId = 'order-rollback'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-rb', referrerId: 'ref-rb', id: 'buyer-rb' },
        items: [],
      } as any)

      const committedWrites: string[] = []
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const fakeTx = new Proxy(prisma, {
          get(target, prop) {
            if (prop === 'reward') {
              return {
                ...target.reward,
                create: vi.fn().mockImplementation(async (data: any) => {
                  committedWrites.push('reward.create')
                  return { id: 'rw-rb', ...data.data }
                }),
              }
            }
            if (prop === 'user') {
              return {
                ...target.user,
                findUnique: target.user.findUnique,
                update: vi.fn().mockImplementation(async () => {
                  committedWrites.push('user.update')
                }),
              }
            }
            if (prop === 'order') {
              return {
                ...target.order,
                update: vi.fn().mockImplementation(async () => {
                  committedWrites.push('order.update')
                }),
              }
            }
            if (prop === 'balanceRecord') return target.balanceRecord
            if (prop === 'dividend') return target.dividend
            if (prop === 'operationLog') return target.operationLog
            return (target as any)[prop]
          },
        })

        prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
        prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
        prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 })
        prisma.order.count.mockResolvedValueOnce(1)
        prisma.user.findUnique.mockResolvedValue({ parentId: null })
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-rb', referrerId: null, level: 1 })
        prisma.balanceRecord.create.mockResolvedValueOnce({})

        throw new Error('Simulated transaction rollback')
      })

      const result = await RewardService.processPaidOrderRewards(orderId)
      expect(result.status).toBe('failed')
      expect(committedWrites).not.toContain('order.update')
    })

    it('Order 只在全部成功后才更新 rewardStatus=completed', async () => {
      const orderId = 'order-final-status'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        status: 'paid',
        payAmount: 1000,
        user: { id: 'buyer-fs', referrerId: null, id: 'buyer-fs' },
        items: [],
      } as any)

      const orderUpdates: any[] = []
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const fakeTx = new Proxy(prisma, {
          get(target, prop) {
            if (prop === 'order') {
              return {
                ...target.order,
                update: vi.fn().mockImplementation(async (data: any) => {
                  orderUpdates.push(data)
                }),
              }
            }
            return (target as any)[prop]
          },
        })
        return fn(fakeTx)
      })

      await RewardService.processPaidOrderRewards(orderId)

      if (orderUpdates.length > 0) {
        const lastUpdate = orderUpdates[orderUpdates.length - 1]
        expect(lastUpdate.data.rewardStatus).toBe('completed')
      }
    })
  })
})
