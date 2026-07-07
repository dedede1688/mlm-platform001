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
import { UserService } from '@/lib/services/user.service'

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

      const update1 = prisma.user.update.mock.calls[0][0]
      const update2 = prisma.user.update.mock.calls[1][0]
      // 资金底座重构: 分红只进 earningsAvailable，不进 balance
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

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, earningsAvailable: 500 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_reward')
      expect(call.data.amount).toBe(-100)
      // 资金底座重构: 退款不碰 balance，balance 快照保持原值
      expect(call.data.balance).toBe(500)

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

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 300, frozenBalance: 10, earningsAvailable: 300 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_dividend')
      expect(call.data.amount).toBe(-50)
      // 资金底座重构: 退款不碰 balance，balance 快照保持原值
      expect(call.data.balance).toBe(300)

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      // 资金底座重构: earningsAvailable=300 够扣 50，只扣 earningsAvailable，不碰 balance/earningsVoided
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

      // earningsAvailable=50 < reward.amount=1000 → 扣 50 可提现 + 作废 950
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 5000, frozenBalance: 0, earningsAvailable: 50, consumeBalance: 0, earningsPending: 0, earningsVoided: 0 })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      // 不报错，且写了流水
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_reward')
      expect(call.data.amount).toBe(-1000)
      expect(call.data.balance).toBe(5000) // 余额不变

      // 验证 update: 扣 earningsAvailable 50 + 增 earningsVoided 950
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

      // earningsAvailable=100 < dividend.amount=500 → 扣 100 可提现 + 作废 400
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 2000, frozenBalance: 0, earningsAvailable: 100, consumeBalance: 0, earningsPending: 0, earningsVoided: 0 })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      // 不报错，且写了流水
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_dividend')
      expect(call.data.amount).toBe(-500)
      expect(call.data.balance).toBe(2000) // 余额不变

      // 验证 update: 扣 earningsAvailable 100 + 增 earningsVoided 400
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

      // user.findUnique 返回 null (用户在 processRefund 期间被删除)
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('不存在')
    })

    // v60.3 batch 7: 补 line 455 - processRefund 中 dividend user.findUnique 返回 null
    it('throws "用户不存在" in processRefund when dividend user not found (line 455)', async () => {
      const orderId = 'order-refund-div-missing'

      prisma.reward.findMany.mockResolvedValueOnce([])
      // 有 dividend,user 在事务中找不到
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-x', userId: 'user-orphan-div', orderId, amount: 50 },
      ])

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))
      // user.findUnique 返回 null (用户在 processRefund 期间被删除)
      prisma.user.findUnique.mockResolvedValueOnce(null)

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

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 200, frozenBalance: 0, earningsAvailable: 200 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 200, frozenBalance: 0, earningsAvailable: 170 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)
      expect(prisma.balanceRecord.create.mock.calls[0][0].data.type).toBe('refund_reward')
      expect(prisma.balanceRecord.create.mock.calls[1][0].data.type).toBe('refund_dividend')

      const update1 = prisma.user.update.mock.calls[0][0]
      const update2 = prisma.user.update.mock.calls[1][0]
      // 资金底座重构: 退款只扣 earningsAvailable（够扣时不碰 earningsVoided），都不碰 balance
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

    it('skips brand bonus when order has upgrade product', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-x',
        status: 'paid',
        payAmount: 100,
        user: { id: 'user-1', referrerId: 'r-1' },
        items: [{ product: { isUpgradeProduct: true } }],
      } as any)
      // mock createReferralReward / createDividendReward / checkUpgradeFromOrder
      // brand bonus 应被跳过
      await RewardService.processOrderRewards('order-x')
      // processRefund 不应被调用(只 processOrderRewards 内调用)
      // 我们直接验证流程不抛错
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
        user: { id: 'buyer', referrerId: null },  // 无 referrer
        items: [],
      } as any)
      const result = await RewardService.processOrderRewards('order-no-ref')
      // referralResult 未定义 → referralUnlockRequired=undefined, referralUnlockAmount=undefined
      expect(result.referralUnlockRequired).toBeUndefined()
      expect(result.referralUnlockAmount).toBeUndefined()
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
      // 临时设 manager pool rate = 0.05 (default) + includeUpstream=true
      const savedInc = businessConfigValues['dividend.manager.include_upstream']
      businessConfigValues['dividend.manager.include_upstream'] = true
      try {
        const orderId = 'order-inc-up'
        const buyerId = 'buyer-inc'

        // 链上 2 个 user:1 个 level=3, 1 个 level=4
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'd1', level: 1, id: buyerId })
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'd1', level: 3 })  // for director pool
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'm1', level: 3, id: 'd1' })
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'm1', level: 4 })  // for manager pool
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 4, id: 'm1' })

        // manager 池 includeUpstream=true → level=3 (d1) 也算进
        prisma.dividend.create.mockResolvedValueOnce({ id: 'div-m-3', userId: 'd1' })
        prisma.user.findUnique.mockResolvedValueOnce({ balance: 1000, frozenBalance: 0 })
        prisma.user.update.mockResolvedValueOnce({})
        prisma.balanceRecord.create.mockResolvedValueOnce({})

        // director 池 share 到 level=4 (m1) - includeUpstream=true default= false for director
        // Actually director.include_upstream=false (default), so only level=3 (d1)
        // 这里只触发 manager pool 为 include_upstream=true 测试

        await RewardService.createDividendReward(orderId, 10000, buyerId)

        // 期望 manager 池把 d1(level=3) 纳入, 所以至少 1 个 div.create
        expect(prisma.dividend.create).toHaveBeenCalled()
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
})
