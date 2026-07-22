/**
 * verify-payment 路由测试
 *
 * 重点验证：
 * 1. 余额不足时返回 code = INSUFFICIENT_BALANCE + data.balance/payAmount/shortage
 * 2. 非余额不足错误仍按原逻辑返回
 * 3. 支付成功路径不受影响
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock verifyToken
vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

// Mock prisma
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    order: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

// Mock verifyPaymentPassword + lock functions
vi.mock('@/lib/auth/payment-password', () => ({
  verifyPaymentPassword: vi.fn(),
  checkPaymentPasswordLock: vi.fn().mockResolvedValue({ locked: false }),
  incrementFailedAttempt: vi.fn().mockResolvedValue({ attempts: 1, locked: false }),
  resetPaymentPasswordLock: vi.fn().mockResolvedValue(undefined),
  PAYMENT_LOCK_THRESHOLD: 5,
}))

// Mock RewardService
vi.mock('@/lib/services/reward.service', () => ({
  RewardService: {
    processOrderRewards: vi.fn().mockResolvedValue({}),
  },
}))

// Mock OrderNotificationService
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyOrderPaid: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock rate-limit
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetIn: 0 }),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitResponse: vi.fn(),
}))

// Mock stats-cache
vi.mock('@/lib/utils/stats-cache', () => ({
  invalidateCache: vi.fn(),
}))

import { verifyToken } from '@/lib/utils/auth'
import { verifyPaymentPassword, checkPaymentPasswordLock, incrementFailedAttempt, resetPaymentPasswordLock } from '@/lib/auth/payment-password'
import { prisma } from '@/lib/prisma'

// 辅助：构造 NextRequest
function makePostRequest(body: Record<string, unknown>) {
  return {
    method: 'POST',
    json: async () => body,
    headers: new Headers(),
  } as any
}

// 辅助：构造 params
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/orders/[id]/verify-payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyPaymentPassword).mockResolvedValue(true)
    vi.mocked(checkPaymentPasswordLock).mockResolvedValue({ locked: false })
    vi.mocked(incrementFailedAttempt).mockResolvedValue({ attempts: 1, locked: false })
    vi.mocked(resetPaymentPasswordLock).mockResolvedValue(undefined)
  })

  describe('余额不足返回结构化错误', () => {
    it('余额不足时返回 code=INSUFFICIENT_BALANCE + balance/payAmount/shortage', async () => {
      const userId = 'user-1'
      const orderId = 'order-1'
      const payAmount = 500
      const userBalance = 200

      vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        userId,
        orderNo: 'ORD-001',
        status: 'pending',
        payAmount,
      })

      prisma.user.findUnique.mockResolvedValueOnce({
        paymentPasswordHash: 'hash',
      })

      // 模拟事务：freshUser 查到余额 200，但 updateMany count=0（余额不足）
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const tx = {
          order: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              balance: userBalance,
              frozenBalance: 0,
              consumeBalance: 100,
              earningsAvailable: 50,
              earningsPending: 0,
              earningsVoided: 0,
              earningsFrozen: 0,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // 余额不足
          },
          balanceRecord: {
            create: vi.fn(),
          },
        }
        return fn(tx)
      })

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))

      const data = await res.json()

      // 验证结构化错误
      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.code).toBe('INSUFFICIENT_BALANCE')
      expect(data.error).toBe('可用余额不足')
      expect(data.data.balance).toBe(userBalance)
      expect(data.data.payAmount).toBe(payAmount)
      expect(data.data.shortage).toBe(payAmount - userBalance) // 300
    })

    it('shortage = payAmount - balance（差额计算正确）', async () => {
      const userId = 'user-2'
      const orderId = 'order-2'
      const payAmount = 1000
      const userBalance = 300

      vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        userId,
        orderNo: 'ORD-002',
        status: 'pending',
        payAmount,
      })

      prisma.user.findUnique.mockResolvedValueOnce({
        paymentPasswordHash: 'hash',
      })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const tx = {
          order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              balance: userBalance,
              frozenBalance: 0,
              consumeBalance: 0,
              earningsAvailable: 0,
              earningsPending: 0,
              earningsVoided: 0,
              earningsFrozen: 0,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          balanceRecord: { create: vi.fn() },
        }
        return fn(tx)
      })

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))

      const data = await res.json()
      expect(data.data.shortage).toBe(700) // 1000 - 300
    })
  })

  describe('非余额不足错误按原逻辑返回', () => {
    it('支付密码错误返回 401（含剩余次数）', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-3' } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-3',
        userId: 'user-3',
        orderNo: 'ORD-003',
        status: 'pending',
        payAmount: 100,
      })

      prisma.user.findUnique.mockResolvedValueOnce({
        paymentPasswordHash: 'hash',
      })

      vi.mocked(verifyPaymentPassword).mockResolvedValueOnce(false)
      vi.mocked(incrementFailedAttempt).mockResolvedValueOnce({ attempts: 1, locked: false })

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: 'wrong' }), makeParams('order-3'))

      const data = await res.json()
      expect(res.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toContain('剩余')
      expect(data.code).toBeUndefined()
    })

    it('订单不存在返回 404（无 code 字段）', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-4' } as any)
      prisma.order.findUnique.mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: '123456' }), makeParams('nonexistent'))

      const data = await res.json()
      expect(res.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('订单不存在')
      expect(data.code).toBeUndefined()
    })

    it('未登录返回 401（无 code 字段）', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: '123456' }), makeParams('order-5'))

      const data = await res.json()
      expect(res.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('未登录')
      expect(data.code).toBeUndefined()
    })

    it('事务中订单状态已变更返回 500（无 code 字段）', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-5' } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-5',
        userId: 'user-5',
        orderNo: 'ORD-005',
        status: 'pending',
        payAmount: 100,
      })

      prisma.user.findUnique.mockResolvedValueOnce({
        paymentPasswordHash: 'hash',
      })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const tx = {
          order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, // 订单状态已变
          user: { findUnique: vi.fn(), updateMany: vi.fn() },
          balanceRecord: { create: vi.fn() },
        }
        return fn(tx)
      })

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: '123456' }), makeParams('order-5'))

      const data = await res.json()
      expect(res.status).toBe(500)
      expect(data.success).toBe(false)
      expect(data.code).toBeUndefined()
    })
  })

  describe('支付成功路径不受影响', () => {
    it('余额充足时支付成功', async () => {
      const userId = 'user-6'
      const orderId = 'order-6'

      vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        userId,
        orderNo: 'ORD-006',
        status: 'pending',
        payAmount: 100,
      })

      prisma.user.findUnique.mockResolvedValueOnce({
        paymentPasswordHash: 'hash',
      })

      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const tx = {
          order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              balance: 500,
              frozenBalance: 0,
              consumeBalance: 0,
              earningsAvailable: 0,
              earningsPending: 0,
              earningsVoided: 0,
              earningsFrozen: 0,
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }), // 余额充足
          },
          balanceRecord: { create: vi.fn().mockResolvedValue({}) },
        }
        return fn(tx)
      })

      const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
      const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))

      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.orderId).toBe(orderId)
      expect(data.data.status).toBe('paid')
      expect(data.code).toBeUndefined() // 成功响应无 code
    })
  })
})
