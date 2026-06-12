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
      // Mock user
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        level: 1,
        unlockedPoints: 100,
      })

      // Mock products
      prisma.product.findMany.mockResolvedValueOnce([{
        id: 'p1',
        name: 'Test Product',
        memberPrice: 100,
        retailPrice: 120,
        stock: 10,
        maxPointsRatio: 50,
      }])

      // Transaction: re-check products
      prisma.product.findMany.mockResolvedValueOnce([{
        id: 'p1',
        name: 'Test Product',
        stock: 10,
      }])

      // Transaction: re-check user
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        level: 1,
        unlockedPoints: 100,
        totalPoints: 200,
        lockedPoints: 100,
      })

      // Create order
      prisma.order.create.mockResolvedValueOnce({
        id: 'o1',
        orderNo: 'ORD123',
        userId: 'u1',
        totalAmount: 100,
        payAmount: 100,
        status: 'pending',
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      })

      // Stock deduction
      prisma.$queryRaw.mockResolvedValueOnce([{ count: 1 }])

      const result = await OrderService.createOrder({
        userId: 'u1',
        items: [{ productId: 'p1', quantity: 1 }],
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
      prisma.order.updateMany.mockResolvedValueOnce({ count: 1 })

      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'o1',
        orderNo: 'ORD123',
        userId: 'u1',
        totalAmount: 100,
        payAmount: 100,
        status: 'paid',
        user: { email: 'test@test.com', phone: '13800000001', nickname: 'Test' },
        items: [{ product: { isUpgradeProduct: false, name: 'Test' } }],
      })

      const { RewardService } = await import('@/lib/services/reward.service')
      vi.mocked(RewardService.processOrderRewards).mockResolvedValueOnce(undefined as any)

      const result = await OrderService.payOrder('o1')
      expect(result).toBeDefined()
      expect(result.status).toBe('paid')
    })

    it('should throw error when order already paid', async () => {
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 }) // No rows updated

      await expect(OrderService.payOrder('o1'))
        .rejects.toThrow('订单不存在或状态已变更')
    })
  })
})
