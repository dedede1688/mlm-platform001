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

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { OrderRewardStateService } from '@/lib/services/order-reward-state.service'

describe('OrderRewardStateService', () => {
  beforeEach(() => {
    Object.values(prisma).forEach((chain: any) => {
      if (chain && typeof chain === 'object') {
        Object.values(chain).forEach((fn: any) => {
          if (vi.isMockFunction(fn)) fn.mockReset()
        })
      }
    })
  })

  describe('claim', () => {
    it('pending order can be claimed', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 })
      const result = await OrderRewardStateService.claim('order-1')
      expect(result).toBe('claimed')
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.data.rewardStatus).toBe('processing')
      expect(call.where.OR).toBeDefined()
    })

    it('failed order with attempts < 5 can be claimed', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 })
      const result = await OrderRewardStateService.claim('order-2')
      expect(result).toBe('claimed')
    })

    it('completed order returns already_completed', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      prisma.order.findUnique.mockResolvedValueOnce({
        status: 'paid',
        rewardStatus: 'completed',
        rewardAttempts: 0,
        rewardLastAttemptAt: null,
      })
      const result = await OrderRewardStateService.claim('order-3')
      expect(result).toBe('already_completed')
    })

    it('processing order within 30 minutes returns already_processing', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      prisma.order.findUnique.mockResolvedValueOnce({
        status: 'paid',
        rewardStatus: 'processing',
        rewardAttempts: 1,
        rewardLastAttemptAt: new Date(),
      })
      const result = await OrderRewardStateService.claim('order-4')
      expect(result).toBe('already_processing')
    })

    it('processing order older than 30 minutes can be reclaimed', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 })
      const result = await OrderRewardStateService.claim('order-5')
      expect(result).toBe('claimed')
    })

    it('order with attempts >= 5 returns attempt_limit_reached', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      prisma.order.findUnique.mockResolvedValueOnce({
        status: 'paid',
        rewardStatus: 'failed',
        rewardAttempts: 5,
        rewardLastAttemptAt: new Date(),
      })
      const result = await OrderRewardStateService.claim('order-6')
      expect(result).toBe('attempt_limit_reached')
    })

    it('non-paid order returns not_paid', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      prisma.order.findUnique.mockResolvedValueOnce({
        status: 'pending',
        rewardStatus: 'pending',
        rewardAttempts: 0,
        rewardLastAttemptAt: null,
      })
      const result = await OrderRewardStateService.claim('order-7')
      expect(result).toBe('not_paid')
    })

    it('order not found returns not_paid', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      prisma.order.findUnique.mockResolvedValueOnce(null)
      const result = await OrderRewardStateService.claim('order-missing')
      expect(result).toBe('not_paid')
    })
  })

  describe('markFailed', () => {
    it('sets rewardStatus=failed and increments rewardAttempts', async () => {
      await OrderRewardStateService.markFailed('order-f1', new Error('test error'))
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.where.id).toBe('order-f1')
      expect(call.data.rewardStatus).toBe('failed')
      expect(call.data.rewardAttempts).toEqual({ increment: 1 })
      expect(call.data.rewardLastError).toBeDefined()
    })

    it('truncates error message to 500 chars', async () => {
      const longError = new Error('x'.repeat(1000))
      await OrderRewardStateService.markFailed('order-f2', longError)
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.data.rewardLastError.length).toBeLessThanOrEqual(500)
    })

    it('does not modify money fields', async () => {
      await OrderRewardStateService.markFailed('order-f3', new Error('test'))
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.data).not.toHaveProperty('balance')
      expect(call.data).not.toHaveProperty('earningsAvailable')
      expect(call.data).not.toHaveProperty('earningsPending')
      expect(call.data).not.toHaveProperty('earningsVoided')
      expect(call.data).not.toHaveProperty('earningsFrozen')
    })

    it('sanitizes error message - no tokens or passwords', async () => {
      const errorWithSecret = new Error('Database error: token=abc123 password=secret')
      await OrderRewardStateService.markFailed('order-f4', errorWithSecret)
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.data.rewardLastError).not.toContain('abc123')
      expect(call.data.rewardLastError).not.toContain('secret')
    })

    it('markFailed 只更新 rewardStatus=processing 的订单', async () => {
      await OrderRewardStateService.markFailed('order-f5', new Error('test'))
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.where.id).toBe('order-f5')
      expect(call.where.rewardStatus).toBe('processing')
    })

    it('markFailed 不会把 completed 降级为 failed', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      await OrderRewardStateService.markFailed('order-completed', new Error('late error'))
      const call = prisma.order.updateMany.mock.calls[0][0]
      expect(call.where.rewardStatus).toBe('processing')
    })
  })
})
