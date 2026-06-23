import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    product: createMockChain(),
    order: createMockChain(),
    reward: createMockChain(),
    pointsRecord: createMockChain(),
    balanceRecord: createMockChain(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/services/reward.service', () => ({
  RewardService: {
    processOrderRewards: vi.fn(),
    processRefund: vi.fn(),
  },
}))

vi.mock('@/lib/notification/sendEmail', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/notification/sendSms', () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { OrderService } from '@/lib/services/order.service'

describe('OrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('createOrder', () => {
    it('should create order successfully', async () => {
      // 事务外：查用户
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', level: 1, unlockedPoints: 100,
      })
      // 事务外：查商品
      prisma.product.findMany.mockResolvedValueOnce([{
        id: 'p1', name: 'Test Product', memberPrice: 100, retailPrice: 120, stock: 10, maxPointsRatio: 50,
      }])
      // 事务内：重新查商品（防并发）
      prisma.product.findMany.mockResolvedValueOnce([{
        id: 'p1', name: 'Test Product', stock: 10,
      }])
      // 事务内：重新查用户（防并发）
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', level: 1, unlockedPoints: 100, totalPoints: 200, lockedPoints: 100,
      })
      // 事务内：创建订单
      prisma.order.create.mockResolvedValueOnce({
        id: 'o1', orderNo: 'ORD123', userId: 'u1', totalAmount: 100, payAmount: 100, status: 'pending',
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      })
      // 事务内：原子扣减库存（业务代码用 tx.product.updateMany）
      prisma.product.updateMany.mockResolvedValueOnce({ count: 1 })

      const result = await OrderService.createOrder({
        userId: 'u1', items: [{ productId: 'p1', quantity: 1 }],
      })

      expect(result).toBeDefined()
      expect(result.id).toBe('o1')
    })

    it('should throw error with non-existent product', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        level: 1,
        unlockedPoints: 0,
      })

      prisma.product.findMany.mockResolvedValueOnce([]) // No products found

      await expect(OrderService.createOrder({
        userId: 'u1',
        items: [{ productId: 'p-nonexistent', quantity: 1 }],
      })).rejects.toThrow('商品 p-nonexistent 不存在')
    })

    it('should throw error with multiple items (one item per order)', async () => {
      await expect(OrderService.createOrder({
        userId: 'u1',
        items: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 1 },
        ],
      })).rejects.toThrow('每个订单只能购买一件商品')
    })

    it('should throw error with quantity > 1', async () => {
      await expect(OrderService.createOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 2 }],
      })).rejects.toThrow('每个订单只能购买一件商品')
    })
  })

  describe('payOrder', () => {
    it('should pay order successfully', async () => {
      // 第一次 findUnique（事务外）：查订单，必须 status='pending'
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'o1', orderNo: 'ORD123', userId: 'u1', totalAmount: 100, payAmount: 100,
        status: 'pending',
      })
      // 事务内：原子 updateMany 改 status=paid
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 })
      // 事务内：payAmount > 0 查 user
      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 1000, frozenBalance: 0,
      })
      // 事务内：原子扣减余额
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 })
      // 事务内：写 BalanceRecord
      prisma.balanceRecord.create.mockResolvedValueOnce({})
      // 事务内：第二次 findUnique 返回支付后的订单
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'o1', orderNo: 'ORD123', userId: 'u1', totalAmount: 100, payAmount: 100,
        status: 'paid',
        user: { email: 'test@test.com', phone: '13800000001', nickname: 'Test' },
        items: [{ product: { isUpgradeProduct: false, name: 'Test' } }],
      })

      const { RewardService } = await import('@/lib/services/reward.service')
      vi.mocked(RewardService.processOrderRewards).mockResolvedValueOnce(undefined as any)

      const result = await OrderService.payOrder('o1')
      expect(result).toBeDefined()
      expect(result.status).toBe('paid')

      const updateManyCall = prisma.user.updateMany.mock.calls[0][0]
      expect(updateManyCall.data).toMatchObject({
        balance: { decrement: 100 },
        consumeBalance: { increment: 100 },
      })
    })

    it('should throw error when order already paid', async () => {
      // 第一次 findUnique（事务外）：订单状态已经是 paid
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'o1', orderNo: 'ORD123', userId: 'u1', totalAmount: 100, payAmount: 100,
        status: 'paid',
      })

      await expect(OrderService.payOrder('o1'))
        .rejects.toThrow('订单不存在或状态已变更')
    })
  })

  describe('requestRefund', () => {
    it('should refund order and decrement consumeBalance', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'o1', orderNo: 'ORD123', userId: 'u1',
        payAmount: 100, pointsUsed: 0,
        status: 'paid',
        items: [{ productId: 'p1', quantity: 1 }],
      })

      prisma.product.update.mockResolvedValueOnce({})

      prisma.user.findUnique.mockResolvedValueOnce({
        balance: 100, frozenBalance: 0, consumeBalance: 100,
      })

      prisma.user.update.mockResolvedValueOnce({})
      prisma.balanceRecord.create.mockResolvedValueOnce({})

      const { RewardService } = await import('@/lib/services/reward.service')
      vi.mocked(RewardService.processRefund).mockResolvedValueOnce(undefined as any)

      prisma.order.update.mockResolvedValueOnce({ id: 'o1', status: 'refunded' })
      prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', status: 'refunded' })

      await OrderService.requestRefund('o1')

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toMatchObject({
        balance: { increment: 100 },
        consumeBalance: { decrement: 100 },
      })
    })
  })
})
