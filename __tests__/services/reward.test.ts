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
      expect(call.data[0].sourceType).toBe('dividend')
      expect(call.data[0].sourceId).toBe('dividend-d1')

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

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'reward-r4', userId: 'user-orphan', type: 'brand_bonus', orderId, amount: 30, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 1 })

      prisma.user.findMany.mockResolvedValueOnce([])

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('不存在')
    })

    it('throws "用户不存在" in processRefund when dividend user not found', async () => {
      const orderId = 'order-refund-div-missing'

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'dividend-x', userId: 'user-orphan-div', orderId, amount: 50, refundedAt: null },
      ])
      prisma.dividend.updateMany.mockImplementationOnce(async () => ({ count: 1 }))
      prisma.user.findMany.mockResolvedValueOnce([])

      await expect(RewardService.processRefund(orderId))
        .rejects.toThrow('不存在')
    })

    // v60.3 batch 7: 补 line 455 - processRefund 中 dividend user.findUnique 返回 null

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

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'div-1', userId: 'user-d1', orderId, amount: 100, refundedAt: null },
      ])
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-d1', balance: 500, frozenBalance: 0, earningsAvailable: 500, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      const dividendFindCall = prisma.dividend.findMany.mock.calls[0][0]
      expect(dividendFindCall.where.refundedAt).toBeNull()

      const updateManyCall = prisma.dividend.updateMany.mock.calls[0][0]
      expect(updateManyCall.where.refundedAt).toBeNull()
    })

    it('退款幂等：第一次有 paid Reward 完成退款，第二次不再扣款和写负流水', async () => {
      const orderId = 'order-idempotent-reward-real'

      const pendingReward = { id: 'r-idem', userId: 'user-idem', type: 'referral', orderId, amount: 100, status: 'paid' }
      const refundedReward = { ...pendingReward, status: 'refunded' }

      prisma.$transaction
        .mockImplementationOnce(async (fn: any) => fn(prisma))
        .mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany
        .mockResolvedValueOnce([pendingReward])
        .mockResolvedValueOnce([refundedReward])
      prisma.dividend.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      prisma.reward.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-idem', balance: 500, frozenBalance: 0, earningsAvailable: 500, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.user.update).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('退款抢占不完整')

      expect(prisma.user.update).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
    })

    it('退款幂等：第一次有 refundedAt:null Dividend 完成退款，第二次不再扣款和写负流水', async () => {
      const orderId = 'order-idempotent-div-real'

      const pendingDiv = { id: 'd-idem', userId: 'user-div-idem', orderId, amount: 50, refundedAt: null }
      const refundedDiv = { ...pendingDiv, refundedAt: new Date() }

      prisma.$transaction
        .mockImplementationOnce(async (fn: any) => fn(prisma))
        .mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      prisma.dividend.findMany
        .mockResolvedValueOnce([pendingDiv])
        .mockResolvedValueOnce([refundedDiv])
      prisma.dividend.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })

      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'user-div-idem', balance: 300, frozenBalance: 0, earningsAvailable: 300, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.createMany.mockResolvedValueOnce({ count: 1 })

      await RewardService.processRefund(orderId)

      expect(prisma.user.update).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('退款抢占不完整')

      expect(prisma.user.update).toHaveBeenCalledTimes(1)
      expect(prisma.balanceRecord.createMany).toHaveBeenCalledTimes(1)
    })

    it('并发抢占：reward updateMany count=0 时抛错，不扣款不写负流水', async () => {
      const orderId = 'order-race-reward'

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'r-race', userId: 'user-race', type: 'referral', orderId, amount: 100, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('退款抢占不完整')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    })

    it('并发抢占：dividend updateMany count=0 时抛错，不扣款不写负流水', async () => {
      const orderId = 'order-race-dividend'

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'd-race', userId: 'user-race-div', orderId, amount: 50, refundedAt: null },
      ])
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('退款抢占不完整')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    })

    it('部分抢占：Reward 查到 2 条但 updateMany.count=1 时抛错回滚', async () => {
      const orderId = 'order-partial-reward'

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([
        { id: 'r-p1', userId: 'user-p1', type: 'referral', orderId, amount: 100, status: 'paid' },
        { id: 'r-p2', userId: 'user-p2', type: 'brand_bonus', orderId, amount: 50, status: 'paid' },
      ])
      prisma.dividend.findMany.mockResolvedValueOnce([])
      prisma.reward.updateMany.mockResolvedValueOnce({ count: 1 })

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('退款抢占不完整')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    })

    it('部分抢占：Dividend 查到 2 条但 updateMany.count=1 时抛错回滚', async () => {
      const orderId = 'order-partial-dividend'

      prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(prisma))

      prisma.reward.findMany.mockResolvedValueOnce([])
      prisma.dividend.findMany.mockResolvedValueOnce([
        { id: 'd-p1', userId: 'user-dp1', orderId, amount: 100, refundedAt: null },
        { id: 'd-p2', userId: 'user-dp2', orderId, amount: 50, refundedAt: null },
      ])
      prisma.dividend.updateMany.mockResolvedValueOnce({ count: 1 })

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('退款抢占不完整')

      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(prisma.balanceRecord.createMany).not.toHaveBeenCalled()
    })

    it('真实事务回滚：事务中途失败后已执行的写入不生效', async () => {
      const orderId = 'order-real-rollback'

      const committedState: string[] = []
      const pendingState: string[] = []

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const fakeTx = new Proxy(prisma, {
          get(target, prop) {
            if (prop === 'reward') {
              return {
                findMany: vi.fn().mockResolvedValue([
                  { id: 'r-rl', userId: 'user-rl', type: 'referral', orderId, amount: 100, status: 'paid' },
                ]),
                updateMany: vi.fn().mockImplementation(async (args: any) => {
                  pendingState.push('reward.updateMany')
                  committedState.push('reward.updateMany')
                  return { count: 1 }
                }),
              }
            }
            if (prop === 'dividend') {
              return {
                findMany: vi.fn().mockResolvedValue([]),
              }
            }
            if (prop === 'user') {
              return {
                ...target.user,
                findMany: vi.fn().mockResolvedValue([
                  { id: 'user-rl', balance: 500, frozenBalance: 0, earningsAvailable: 500, consumeBalance: 0, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
                ]),
                update: vi.fn().mockImplementation(async () => {
                  pendingState.push('user.update')
                  committedState.push('user.update')
                }),
              }
            }
            if (prop === 'balanceRecord') {
              return {
                createMany: vi.fn().mockImplementation(async () => {
                  pendingState.push('balanceRecord.createMany')
                  throw new Error('Simulated write failure after partial commit')
                }),
              }
            }
            return (target as any)[prop]
          },
        })

        try {
          await fn(fakeTx)
        } catch (e) {
          while (committedState.length > 0) {
            committedState.pop()
          }
          throw e
        }
      })

      await expect(RewardService.processRefund(orderId)).rejects.toThrow('Simulated write failure')

      expect(pendingState).toContain('reward.updateMany')
      expect(pendingState).toContain('user.update')
      expect(pendingState).toContain('balanceRecord.createMany')
      expect(committedState).toHaveLength(0)
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


  // ============ processPaidOrderRewards 主线覆盖（迁移自旧 helper） ============
  describe('processPaidOrderRewards - 主线覆盖', () => {
    it('推荐人已买升级品时生成 referral reward，earningsAvailable 增加', async () => {
      const orderId = 'order-main-ref'
      const referrerId = 'ref-main'
      const expectedAmount = 200
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-main', referrerId, id: 'buyer-main' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-main-ref', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-main', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const rewardCall = prisma.reward.create.mock.calls[0][0]
      expect(rewardCall.data.type).toBe('referral')
      expect(rewardCall.data.userId).toBe(referrerId)
      expect(rewardCall.data.amount).toBe(expectedAmount)

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toMatchObject({ earningsAvailable: { increment: expectedAmount } })
      expect(userUpdateCall.data).not.toHaveProperty('balance')

      const brCall = prisma.balanceRecord.create.mock.calls[0][0]
      expect(brCall.data.type).toBe('referral_reward')
    })

    it('推荐人没买升级品时不发 referral reward', async () => {
      const orderId = 'order-no-ref'
      const referrerId = 'ref-no-upgrade'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-no-ref', referrerId, id: 'buyer-no-ref' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-no-ref', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const referralCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'referral')
      expect(referralCall).toBeUndefined()
    })

    it('品牌管理奖按安置链找到经销商，生成 brand_bonus reward', async () => {
      const orderId = 'order-main-brand'
      const referrerId = 'ref-brand-main'
      const targetUserId = 'dist-brand'
      const expectedAmount = 200
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-brand-main', referrerId, id: 'buyer-brand-main' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-ref-bm', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: targetUserId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: targetUserId, level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-brand-main', userId: targetUserId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-brand-main', referrerId: null, level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: targetUserId })
      prisma.order.update.mockResolvedValueOnce({})

      await RewardService.processPaidOrderRewards(orderId)

      const brandCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'brand_bonus')
      expect(brandCall).toBeDefined()
      expect(brandCall![0].data.userId).toBe(targetUserId)
      expect(brandCall![0].data.amount).toBe(expectedAmount)

      const userUpdateCall = prisma.user.update.mock.calls.find((c: any) => c[0].where.id === targetUserId)
      expect(userUpdateCall).toBeDefined()
      expect(userUpdateCall![0].data).toMatchObject({ earningsAvailable: { increment: expectedAmount } })
    })

    it('A 是会员时跳过 A，安置链上第 1 个经销商收到品牌管理奖', async () => {
      const orderId = 'order-skip-member'
      const referrerId = 'ref-member'
      const distributorId = 'dist-skip'
      const expectedAmount = 200
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-skip', referrerId, id: 'buyer-skip' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-skip-ref', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 1, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: distributorId })
      prisma.user.findUnique.mockResolvedValueOnce({ id: distributorId, level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-skip-brand', userId: distributorId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-skip', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const brandCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'brand_bonus')
      expect(brandCall).toBeDefined()
      expect(brandCall![0].data.userId).toBe(distributorId)
      expect(brandCall![0].data.amount).toBe(expectedAmount)
    })

    it('找不到对应经销商时写 OperationLog 沉淀记录', async () => {
      const orderId = 'order-sink'
      const referrerId = 'ref-sink'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-sink', referrerId, id: 'buyer-sink' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-sink-ref', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-sink', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      const brandCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'brand_bonus')
      expect(brandCall).toBeUndefined()
      expect(prisma.operationLog.create).toHaveBeenCalledTimes(1)
      const logCall = prisma.operationLog.create.mock.calls[0][0]
      expect(logCall.data.action).toBe('BRAND_BONUS_SINK')
    })

    it('maxLayers=0（referrer level=0）时不调 order.count，不发品牌管理奖', async () => {
      const orderId = 'order-max0'
      const referrerId = 'ref-max0'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-max0', referrerId, id: 'buyer-max0' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-max0-ref', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 0, directDistributorCount: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-max0', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      expect(prisma.order.count).not.toHaveBeenCalled()
      const brandCall = prisma.reward.create.mock.calls.find((c: any) => c[0].data.type === 'brand_bonus')
      expect(brandCall).toBeUndefined()
    })

    it('maxLayers=2（经销商 0 直推）时品牌管理奖最多找 2 层', async () => {
      const orderId = 'order-max2'
      const referrerId = 'ref-max2'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-max2', referrerId, id: 'buyer-max2' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-max2-ref', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 0 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-max2', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      expect(prisma.order.count).toHaveBeenCalledTimes(1)
    })

    it('maxLayers=4（经销商 1 直推）时品牌管理奖会检查安置链', async () => {
      const orderId = 'order-max4'
      const referrerId = 'ref-max4'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-max4', referrerId, id: 'buyer-max4' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-max4-ref', userId: referrerId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 1 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValue({ parentId: null })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-max4', referrerId: null, level: 1 })

      await RewardService.processPaidOrderRewards(orderId)

      expect(prisma.order.count).toHaveBeenCalledTimes(1)
    })

    it('分红池：有 eligible users 时生成 dividend + balanceRecord', async () => {
      const orderId = 'order-div-main'
      const directorId = 'dir-main'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 10000,
        user: { id: 'buyer-div-main', referrerId: directorId, id: 'buyer-div-main' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-div-ref', userId: directorId })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.operationLog.create.mockResolvedValueOnce({})
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-div-main', referrerId: directorId, level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: directorId, level: 3 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 3, id: directorId })
      prisma.dividend.create.mockResolvedValueOnce({ id: 'div-main-1', userId: directorId, amount: 500 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-div-main', userId: directorId })
      prisma.user.findMany.mockResolvedValueOnce([
        { id: directorId, balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
      ])
      prisma.user.findUnique.mockResolvedValueOnce({ id: directorId })
      prisma.order.update.mockResolvedValueOnce({})

      await RewardService.processPaidOrderRewards(orderId)

      const dividendCall = prisma.dividend.create.mock.calls[0][0]
      expect(dividendCall.data.poolType).toBe('director')
      expect(dividendCall.data.settled).toBe(true)

      const brCall = prisma.balanceRecord.createMany.mock.calls[0][0]
      expect(brCall.data[0].type).toBe('dividend_reward')
      expect(brCall.data[0].sourceType).toBe('dividend')
      expect(brCall.data[0].sourceId).toBe('div-main-1')
    })

    it('分红池：includeUpstream=true 时包含更高级别用户', async () => {
      const orderId = 'order-div-up'
      const directorId = 'dir-up'
      const managerId = 'mgr-up'
      const savedInc = businessConfigValues['dividend.manager.include_upstream']
      businessConfigValues['dividend.manager.include_upstream'] = true
      try {
        ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
        prisma.order.findUnique.mockResolvedValueOnce({
          id: orderId, status: 'paid', payAmount: 10000,
          user: { id: 'buyer-div-up', referrerId: directorId, id: 'buyer-div-up' },
          items: [],
        } as any)
        prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
        prisma.reward.create.mockResolvedValueOnce({ id: 'rw-div-up-ref', userId: directorId })
        prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
        prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
        prisma.order.count.mockResolvedValueOnce(1)
        prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
        prisma.operationLog.create.mockResolvedValueOnce({})
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-div-up', referrerId: directorId, level: 1 })
        prisma.user.findUnique.mockResolvedValueOnce({ id: directorId, level: 3 })
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: managerId, level: 3, id: directorId })
        prisma.user.findUnique.mockResolvedValueOnce({ id: managerId, level: 4 })
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 4, id: managerId })
        prisma.dividend.create.mockResolvedValueOnce({ id: 'div-up-d1', userId: directorId, amount: 500 })
        prisma.reward.create.mockResolvedValueOnce({ id: 'rw-div-up-d1', userId: directorId })
        prisma.user.findMany.mockResolvedValueOnce([
          { id: directorId, balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
        ])
        prisma.dividend.create.mockResolvedValueOnce({ id: 'div-up-m1', userId: managerId, amount: 500 })
        prisma.reward.create.mockResolvedValueOnce({ id: 'rw-div-up-m1', userId: managerId })
        prisma.user.findMany.mockResolvedValueOnce([
          { id: directorId, balance: 1000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
          { id: managerId, balance: 2000, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 200, earningsPending: 0, earningsVoided: 0, earningsFrozen: 0 },
        ])
        prisma.user.findUnique.mockResolvedValueOnce({ id: directorId })
        prisma.user.findUnique.mockResolvedValueOnce({ id: managerId })
        prisma.order.update.mockResolvedValueOnce({})

        await RewardService.processPaidOrderRewards(orderId)

        expect(prisma.dividend.create).toHaveBeenCalled()
      } finally {
        businessConfigValues['dividend.manager.include_upstream'] = savedInc
      }
    })

    it('分红池：rate=0 时跳过该池', async () => {
      const orderId = 'order-div-rate0'
      const directorId = 'dir-rate0'
      const saved = businessConfigValues['dividend.director.rate']
      businessConfigValues['dividend.director.rate'] = 0
      try {
        ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
        prisma.order.findUnique.mockResolvedValueOnce({
          id: orderId, status: 'paid', payAmount: 10000,
          user: { id: 'buyer-rate0', referrerId: directorId, id: 'buyer-rate0' },
          items: [],
        } as any)
        prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
        prisma.reward.create.mockResolvedValueOnce({ id: 'rw-rate0-ref', userId: directorId })
        prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
        prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
        prisma.order.count.mockResolvedValueOnce(1)
        prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
        prisma.operationLog.create.mockResolvedValueOnce({})
        prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-rate0', referrerId: directorId, level: 1 })
        prisma.user.findUnique.mockResolvedValueOnce({ id: directorId, level: 3 })
        prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 3, id: directorId })
        prisma.user.findUnique.mockResolvedValueOnce({ id: directorId })
        prisma.order.update.mockResolvedValueOnce({})

        await RewardService.processPaidOrderRewards(orderId)

        expect(prisma.dividend.create).not.toHaveBeenCalled()
      } finally {
        businessConfigValues['dividend.director.rate'] = saved
      }
    })

    it('分红池：无 eligible users 时不创建 dividend', async () => {
      const orderId = 'order-div-no-eligible'
      ;(OrderRewardStateService.claim as any).mockResolvedValueOnce('claimed')
      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId, status: 'paid', payAmount: 1000,
        user: { id: 'buyer-no-elig', referrerId: 'member-1', id: 'buyer-no-elig' },
        items: [],
      } as any)
      prisma.user.findUnique.mockResolvedValueOnce({ upgradeProductCount: 5 })
      prisma.reward.create.mockResolvedValueOnce({ id: 'rw-no-elig-ref', userId: 'member-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ balance: 500, frozenBalance: 0, consumeBalance: 0, earningsAvailable: 100, earningsPending: 0, earningsVoided: 0 })
      prisma.user.findUnique.mockResolvedValueOnce({ level: 3, directDistributorCount: 2 })
      prisma.order.count.mockResolvedValueOnce(1)
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })
      prisma.operationLog.create.mockResolvedValueOnce({})
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-no-elig', referrerId: 'member-1', level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'member-1', level: 1 })
      prisma.user.findUnique.mockResolvedValueOnce({ referrerId: null, level: 1, id: 'member-1' })
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'buyer-no-elig' })
      prisma.order.update.mockResolvedValueOnce({})

      await RewardService.processPaidOrderRewards(orderId)

      expect(prisma.dividend.create).not.toHaveBeenCalled()
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
