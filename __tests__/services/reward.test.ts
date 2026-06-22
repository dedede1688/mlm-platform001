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
    reward: createMockChain(),
    dividend: createMockChain(),
    order: createMockChain(),
    balanceRecord: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

// Mock UserService (used by checkUpgradeFromOrder)
vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    addUpgradeProductCount: vi.fn(),
    addDirectSales: vi.fn(),
    checkAndUpgradeLevel: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { RewardService } from '@/lib/services/reward.service'

describe('RewardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // $transaction mock: 传 fn(prisma) 让 tx = prisma
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  // ========================================
  // createReferralReward
  // ========================================
  describe('createReferralReward', () => {
    it('should create referral reward and write BalanceRecord with type=referral_reward', async () => {
      const orderId = 'order-1'
      const orderAmount = 1000
      const referrerId = 'referrer-1'
      const fromUserId = 'buyer-1'
      const expectedAmount = 100 // 10% of 1000

      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-1', userId: referrerId, type: 'referral', orderId, amount: expectedAmount, fromUserId, level: 1, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 500, frozenBalance: 0,
      })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createReferralReward(orderId, orderAmount, referrerId, fromUserId)

      // 验证 reward.create 被调用
      expect(prisma.reward.create).toHaveBeenCalledTimes(1)
      expect(prisma.reward.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: referrerId,
          type: 'referral',
          orderId,
          amount: expectedAmount,
          fromUserId,
          level: 1,
          status: 'paid',
        }),
      })

      // 验证 balanceRecord.create 被调用 1 次，type=referral_reward
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const balanceRecordCall = prisma.balanceRecord.create.mock.calls[0][0]
      expect(balanceRecordCall.data.type).toBe('referral_reward')
      expect(balanceRecordCall.data.amount).toBe(expectedAmount)
      expect(balanceRecordCall.data.balance).toBe(500 + expectedAmount) // before.balance + amount
      expect(balanceRecordCall.data.frozenBalance).toBe(0)
      expect(balanceRecordCall.data.sourceType).toBe('reward')
      expect(balanceRecordCall.data.sourceId).toBe('reward-1')
      expect(balanceRecordCall.data.userId).toBe(referrerId)
    })

    it('should skip BalanceRecord when user not found (before=null)', async () => {
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-2', userId: 'u-x', type: 'referral', orderId: 'o-2', amount: 50, fromUserId: 'b-2', level: 1, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce(null) // before = null
      prisma.user.update.mockResolvedValueOnce({})

      await RewardService.createReferralReward('o-2', 500, 'u-x', 'b-2')

      // balanceRecord.create 不应被调用（before 为 null 时 if (before) 跳过）
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })

  // ========================================
  // createBrandBonusReward
  // ========================================
  describe('createBrandBonusReward', () => {
    it('should create brand bonus reward and write BalanceRecord with type=brand_bonus (no _reward suffix)', async () => {
      const orderId = 'order-1'
      const orderAmount = 1000
      const referrerId = 'referrer-1'
      const fromUserId = 'buyer-1'
      const expectedAmount = 200 // 20% of 1000

      // referrer level >= DISTRIBUTOR (2)
      prisma.user.findUnique.mockResolvedValueOnce({ level: 2 }) // referrer check
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-b1', userId: referrerId, type: 'brand_bonus', orderId, amount: expectedAmount, fromUserId, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 300, frozenBalance: 10,
      }) // before balance inside tx
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createBrandBonusReward(orderId, orderAmount, referrerId, fromUserId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const balanceRecordCall = prisma.balanceRecord.create.mock.calls[0][0]
      expect(balanceRecordCall.data.type).toBe('brand_bonus') // 不带 _reward 后缀
      expect(balanceRecordCall.data.amount).toBe(expectedAmount)
      expect(balanceRecordCall.data.balance).toBe(300 + expectedAmount)
      expect(balanceRecordCall.data.frozenBalance).toBe(10)
      expect(balanceRecordCall.data.sourceType).toBe('reward')
      expect(balanceRecordCall.data.sourceId).toBe('reward-b1')
    })

    it('should return early when referrer level < DISTRIBUTOR', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1 }) // 会员，低于经销商(2)

      await RewardService.createBrandBonusReward('o-1', 1000, 'referrer-low', 'buyer-1')

      // 不应创建任何记录
      expect(prisma.reward.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should return early when referrer not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await RewardService.createBrandBonusReward('o-1', 1000, 'nonexistent', 'buyer-1')

      expect(prisma.reward.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })

  // ========================================
  // createTeamRewards
  // ========================================
  describe('createTeamRewards', () => {
    it('should create team rewards for each eligible level and write BalanceRecord with type=team_reward', async () => {
      const orderId = 'order-1'
      const orderAmount = 1000
      const buyerId = 'buyer-1'

      // createTeamRewards 循环内每级调 prisma.user.findUnique 两次（查 referrerId + level），
      // 然后事务内再调一次（查 balance）。需按调用顺序精确 mock。
      // TEAM_REWARD_LEVELS 有 3 级，每级循环：
      //   1. prisma.user.findUnique({ where: { id: currentUserId }, select: { referrerId } }) → 循环外
      //   2. prisma.user.findUnique({ where: { id: referrerId }, select: { level } }) → 循环外
      //   3. 事务内: reward.create → user.findUnique(查balance) → user.update → balanceRecord.create

      // Level 1: currentUserId=buyerId → referrerId=distributor-1
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'distributor-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 2 }) // distributor-1 符合
      // 事务内
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-team-1', userId: 'distributor-1', type: 'team', orderId, amount: 50, fromUserId: buyerId, level: 1, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 100, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // Level 2: currentUserId=distributor-1 → referrerId=distributor-2
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'distributor-2' })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 2 }) // distributor-2 符合
      // 事务内
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-team-2', userId: 'distributor-2', type: 'team', orderId, amount: 30, fromUserId: buyerId, level: 2, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 200, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // Level 3: currentUserId=distributor-2 → referrerId=distributor-3
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'distributor-3' })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 2 }) // distributor-3 符合
      // 事务内
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-team-3', userId: 'distributor-3', type: 'team', orderId, amount: 20, fromUserId: buyerId, level: 3, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 300, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.createTeamRewards(orderId, orderAmount, buyerId)

      // 应该调用 3 次 balanceRecord.create（3 级团队奖）
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(3)

      // 验证每级的 type 都是 team_reward
      for (let i = 0; i < 3; i++) {
        const call = prisma.balanceRecord.create.mock.calls[i][0]
        expect(call.data.type).toBe('team_reward')
        expect(call.data.sourceType).toBe('reward')
        expect(call.data.sourceId).toBe(`reward-team-${i + 1}`)
      }
    })

    it('should skip ineligible referrer (level < DISTRIBUTOR) and continue upward', async () => {
      // buyer → member (level=1, 不符合) → distributor (level=2, 符合)
      // Level 1: buyer → member-1
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'member-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1 }) // member-1 不符合，继续向上

      // Level 2: currentUserId=member-1 → distributor-1
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'distributor-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 2 }) // distributor-1 符合
      // 事务内
      prisma.reward.create.mockResolvedValueOnce({
        id: 'reward-team-skip', userId: 'distributor-1', type: 'team', orderId: 'o-1', amount: 50, fromUserId: 'buyer-1', level: 1, status: 'paid',
      })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 200, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // Level 3: currentUserId=distributor-1 → null
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null })

      await RewardService.createTeamRewards('o-1', 1000, 'buyer-1')

      // 只 1 个符合条件，1 次 balanceRecord
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.create.mock.calls[0][0].data.type).toBe('team_reward')
    })

    it('should stop when no referrer found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null }) // buyer 无推荐人

      await RewardService.createTeamRewards('o-1', 1000, 'buyer-1')

      expect(prisma.reward.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })

  // ========================================
  // createDividendReward
  // ========================================
  describe('createDividendReward', () => {
    it('should create dividend rewards for eligible users and write BalanceRecord with type=dividend_reward', async () => {
      const orderId = 'order-1'
      const orderAmount = 10000
      const buyerId = 'buyer-1'

      // createDividendReward 循环：while 遍历推荐链，查 prisma.user.findUnique 两次/轮
      // 第1轮：currentUserId=buyerId
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'supervisor-1', level: 1, id: buyerId })
      // 查 referrer supervisor-1
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'supervisor-1', level: 5 }) // >= SUPERVISOR(5), 符合
      // 第2轮：currentUserId=supervisor-1
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'president-1', level: 5, id: 'supervisor-1' })
      // 查 referrer president-1
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'president-1', level: 6 }) // >= SUPERVISOR(5), 符合
      // 第3轮：currentUserId=president-1 → 无推荐人
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 6, id: 'president-1' })

      // 事务内：2 个符合条件用户
      // supervisor-1: weight=1, president-1: weight=2, totalWeight=3
      // totalPool = 10000 * 0.05 = 500
      for (let i = 0; i < 2; i++) {
        prisma.dividend.create.mockResolvedValueOnce({
          id: `dividend-${i + 1}`, userId: i === 0 ? 'supervisor-1' : 'president-1', orderId, amount: 166.67 + i * 166.67, userLevel: 5 + i, totalPool: 500, dividendDate: new Date(),
        })
        prisma.user.findUnique.mockResolvedValueOnce({
          balance: 1000, frozenBalance: 0,
        })
        prisma.user.update.mockResolvedValueOnce({})
        prisma.balanceRecord.create.mockResolvedValueOnce({})
      }

      await RewardService.createDividendReward(orderId, orderAmount, buyerId)

      // 2 个符合条件用户，2 次 balanceRecord.create
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)

      // 验证 type=dividend_reward, sourceId=dividend.id
      for (let i = 0; i < 2; i++) {
        const call = prisma.balanceRecord.create.mock.calls[i][0]
        expect(call.data.type).toBe('dividend_reward')
        expect(call.data.sourceType).toBe('reward')
        expect(call.data.sourceId).toBe(`dividend-${i + 1}`) // dividend.id，不是 reward.id
        expect(call.data.frozenBalance).toBe(0) // frozenBalance 不变
      }
    })

    it('should return early when no eligible users (all levels < SUPERVISOR)', async () => {
      // buyer → member(level=1, 不符合) → distributor(level=2, 不符合)
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'member-1', level: 1, id: 'buyer-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'member-1', level: 1 }) // < 5, 不符合
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: 'distributor-1', level: 1, id: 'member-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'distributor-1', level: 2 }) // < 5, 不符合
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 2, id: 'distributor-1' })

      await RewardService.createDividendReward('o-1', 1000, 'buyer-1')

      expect(prisma.dividend.create).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })
  })

  // ========================================
  // processRefund
  // ========================================
  describe('processRefund', () => {
    it('should deduct rewards and write BalanceRecord with type=refund_reward (negative amount)', async () => {
      const orderId = 'order-refund-1'

      // 1 个已支付奖励
      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r1', userId: 'user-1', type: 'referral', orderId, amount: 100, status: 'paid' },
      ])
      // 无分红
      prisma.dividend.findMany.mockResolvedValueOnce([])

      // 事务内: tx.user.findUnique → tx.user.update → tx.reward.update → tx.balanceRecord.create
      // tx = prisma (mock 实现)
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      // 验证 balanceRecord.create 被调用 1 次
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_reward')
      expect(call.data.amount).toBe(-100) // 负数
      expect(call.data.balance).toBe(500 - 100) // newBalance = 400
      expect(call.data.frozenBalance).toBe(0)
      expect(call.data.sourceType).toBe('reward')
      expect(call.data.sourceId).toBe('reward-r1')
    })

    it('should deduct dividends and write BalanceRecord with type=refund_dividend (negative amount)', async () => {
      const orderId = 'order-refund-2'

      // 无奖励
      prisma.reward.findMany.mockResolvedValueOnce([])
      // 1 个分红
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d1', userId: 'user-2', orderId, amount: 50 },
      ])

      // 事务内: tx.user.findUnique → tx.user.update → tx.dividend.delete → tx.balanceRecord.create
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 300, frozenBalance: 10 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(1)
      const call = prisma.balanceRecord.create.mock.calls[0][0]
      expect(call.data.type).toBe('refund_dividend')
      expect(call.data.amount).toBe(-50) // 负数
      expect(call.data.balance).toBe(300 - 50) // newBalance = 250
      expect(call.data.frozenBalance).toBe(10)
      expect(call.data.sourceType).toBe('reward')
      expect(call.data.sourceId).toBe('dividend-d1')
    })

    it('should throw error when user balance insufficient for reward refund', async () => {
      const orderId = 'order-refund-3'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r2', userId: 'user-3', type: 'referral', orderId, amount: 1000, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])

      // 事务内: 用户余额不足
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 50, frozenBalance: 0 })

      // processRefund 内部 throw 后，$transaction 应该让错误传播
      // 但 mock 的 $transaction 实现 fn(prisma) 不会自动处理 throw
      // 需要让 $transaction 正确传播错误
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        try {
          return await fn(prisma)
        } catch (e) {
          throw e
        }
      })

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('余额不足，无法扣回奖励')

      // 不应写 BalanceRecord
      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should throw error when user balance insufficient for dividend refund', async () => {
      const orderId = 'order-refund-4'

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d2', userId: 'user-4', orderId, amount: 500 },
      ])

      prisma.user.findUnique.mockResolvedValueOnce({ balance: 100, frozenBalance: 0 })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        try {
          return await fn(prisma)
        } catch (e) {
          throw e
        }
      })

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('余额不足，无法扣回分红')

      expect(prisma.balanceRecord.create).not.toHaveBeenCalled()
    })

    it('should handle both rewards and dividends in single transaction', async () => {
      const orderId = 'order-refund-5'

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r3', userId: 'user-5', type: 'team', orderId, amount: 30, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-d3', userId: 'user-5', orderId, amount: 20 },
      ])

      // reward refund: tx.user.findUnique → tx.user.update → tx.reward.update → tx.balanceRecord.create
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 200, frozenBalance: 0 })
      prisma.user.update.mockResolvedValueOnce({})
      prisma.reward.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      // dividend refund: tx.user.findUnique → tx.user.update → tx.dividend.delete → tx.balanceRecord.create
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 170, frozenBalance: 0 }) // after reward deduction
      prisma.user.update.mockResolvedValueOnce({})
      prisma.dividend.delete.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      await RewardService.processRefund(orderId)

      // 2 次 balanceRecord.create：1 reward + 1 dividend
      expect(prisma.balanceRecord.create).toHaveBeenCalledTimes(2)

      const rewardCall = prisma.balanceRecord.create.mock.calls[0][0]
      expect(rewardCall.data.type).toBe('refund_reward')
      expect(rewardCall.data.amount).toBe(-30)

      const dividendCall = prisma.balanceRecord.create.mock.calls[1][0]
      expect(dividendCall.data.type).toBe('refund_dividend')
      expect(dividendCall.data.amount).toBe(-20)
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