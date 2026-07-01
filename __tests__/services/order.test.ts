import { describe, it, expect, vi, beforeEach } from 'vitest'

// v60.3 batch 3: order.service.ts 补全
// 简化策略:每个测试只 mock 必要的部分,避免 queue 错位

const mocks = vi.hoisted(() => {
  const order = {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
  }
  const user = {
    findUnique: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  }
  const product = {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  }
  const pointsRecord = {
    create: vi.fn().mockResolvedValue({}),
  }
  const $transaction = vi.fn()
  return { order, user, product, pointsRecord, $transaction }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: mocks.order,
    user: mocks.user,
    product: mocks.product,
    pointsRecord: mocks.pointsRecord,
    $transaction: mocks.$transaction,
  },
}))

import { OrderService } from '@/lib/services/order.service'

describe('OrderService', () => {
  beforeEach(() => {
    // 重置所有 mock 调用历史,但保留默认 mockImplementation
    mocks.order.findUnique.mockClear()
    mocks.order.findMany.mockClear()
    mocks.order.count.mockClear()
    mocks.order.create.mockClear()
    mocks.user.findUnique.mockClear()
    mocks.user.updateMany.mockClear()
    mocks.product.findMany.mockClear()
    mocks.product.updateMany.mockClear()
    mocks.pointsRecord.create.mockClear()
    mocks.$transaction.mockClear()

    // 设置默认行为
    mocks.$transaction.mockImplementation(async (cb: any) => {
      return cb({
        order: mocks.order,
        user: mocks.user,
        product: mocks.product,
        pointsRecord: mocks.pointsRecord,
      })
    })
    // 默认 order.create 透传 data
    mocks.order.create.mockImplementation((args: any) =>
      Promise.resolve({ id: 'order-1', orderNo: 'ORD001', ...(args?.data ?? args) })
    )
    // 默认 findUnique 返回 null
    mocks.user.findUnique.mockResolvedValue(null)
    // 默认 findMany 返回空数组
    mocks.product.findMany.mockResolvedValue([])
    // 默认 user.findUnique 在事务前返回有效用户
    mocks.user.findUnique.mockResolvedValue({ id: 'user-1', level: 1, unlockedPoints: 0 } as any)
    // 默认 findMany 返回有效商品
    mocks.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'P', stock: 10, memberPrice: 100, retailPrice: 120, maxPointsRatio: 50 },
    ] as any)
    // 默认 updateMany 成功
    mocks.product.updateMany.mockResolvedValue({ count: 1 })
    mocks.user.updateMany.mockResolvedValue({ count: 1 })
  })

  // ============ createOrder - 校验分支 ============
  describe('createOrder - validation', () => {
    it('throws when items.length !== 1', async () => {
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [
            { productId: 'p1', quantity: 1 },
            { productId: 'p2', quantity: 1 },
          ],
        })
      ).rejects.toThrow('每个订单只能购买一件商品')
    })

    it('throws when quantity !== 1', async () => {
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 5 }],
        })
      ).rejects.toThrow('每个订单只能购买一件商品')
    })

    it('throws when user not found', async () => {
      mocks.user.findUnique.mockResolvedValueOnce(null)
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('用户不存在')
    })

    it('throws when product not found', async () => {
      mocks.product.findMany.mockResolvedValueOnce([])
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('商品 p1 不存在')
    })

    it('throws when stock insufficient', async () => {
      mocks.product.findMany.mockResolvedValueOnce([
        { id: 'p1', name: 'Product A', stock: 0, memberPrice: 100, retailPrice: 120, maxPointsRatio: 50 },
      ] as any)
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('商品 Product A 库存不足')
    })
  })

  // ============ createOrder - happy path ============
  describe('createOrder - happy path', () => {
    it('uses memberPrice when user.level >= 1', async () => {
      mocks.user.findUnique.mockResolvedValue({ id: 'user-1', level: 3, unlockedPoints: 0 } as any)
      mocks.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'P', stock: 10, memberPrice: 100, retailPrice: 150, maxPointsRatio: 50 },
      ] as any)

      const result = await OrderService.createOrder({
        userId: 'user-1',
        items: [{ productId: 'p1', quantity: 1 }],
      }) as any

      expect(result.totalAmount).toBe(100) // memberPrice=100
      expect(result.payAmount).toBe(100)
      expect(result.pointsUsed).toBe(0)
    })

    it('writes shipping info to order (v43-4)', async () => {
      await OrderService.createOrder({
        userId: 'user-1',
        items: [{ productId: 'p1', quantity: 1 }],
        recipientName: '张三',
        recipientPhone: '13800138000',
        shippingAddress: '北京市朝阳区',
      })

      expect(mocks.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientName: '张三',
            recipientPhone: '13800138000',
            shippingAddress: '北京市朝阳区',
          }),
        })
      )
    })

    it('skips points deduction when unlockedPoints = 0', async () => {
      const result = await OrderService.createOrder({
        userId: 'user-1',
        items: [{ productId: 'p1', quantity: 1 }],
        pointsUsed: 100, // 想用 100,但 unlockedPoints=0
      }) as any

      expect(result.pointsUsed).toBe(0) // actualPointsUsed = min(100, 0) = 0
      expect(result.pointsDiscount).toBe(0)
      expect(mocks.pointsRecord.create).not.toHaveBeenCalled()
    })

    it('caps pointsDiscount at maxPointsRatio*totalAmount', async () => {
      mocks.user.findUnique.mockResolvedValue({ id: 'user-1', level: 1, unlockedPoints: 9999 } as any)

      const result = await OrderService.createOrder({
        userId: 'user-1',
        items: [{ productId: 'p1', quantity: 1 }],
        pointsUsed: 9999,
      }) as any

      // maxPointsDiscount = 100 * 50% = 50, pointsDiscount cap 到 50
      expect(result.pointsUsed).toBe(9999)
      expect(result.pointsDiscount).toBe(50)
      expect(result.payAmount).toBe(50)
    })

    it('throws when concurrent stock change (updateMany count=0)', async () => {
      mocks.product.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('库存不足')
    })

    it('throws when concurrent points change (updateMany count=0)', async () => {
      mocks.user.findUnique.mockResolvedValueOnce({ id: 'user-1', level: 1, unlockedPoints: 100 } as any)
      mocks.user.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
          pointsUsed: 50,
        })
      ).rejects.toThrow('可用积分不足')
    })

    it('throws when concurrent stock change in transaction (freshStock insufficient)', async () => {
      // 第一次 findMany:事务前返回足够库存
      mocks.product.findMany
        .mockResolvedValueOnce([{ id: 'p1', name: 'P', stock: 10, memberPrice: 100, retailPrice: 120, maxPointsRatio: 50 }] as any)
        // 第二次 findMany:事务内返回库存 0
        .mockResolvedValueOnce([{ id: 'p1', name: 'P', stock: 0, memberPrice: 100, retailPrice: 120, maxPointsRatio: 50 }] as any)
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('商品 P 库存不足')
    })

    it('throws when freshProduct missing in transaction', async () => {
      mocks.product.findMany
        .mockResolvedValueOnce([{ id: 'p1', name: 'P', stock: 10, memberPrice: 100, retailPrice: 120, maxPointsRatio: 50 }] as any)
        .mockResolvedValueOnce([]) // 事务内空
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('商品 p1 不存在')
    })

    it('throws when freshUser null in transaction', async () => {
      mocks.user.findUnique
        .mockResolvedValueOnce({ id: 'user-1', level: 1, unlockedPoints: 0 } as any) // 事务前
        .mockResolvedValueOnce(null) // 事务内
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
        })
      ).rejects.toThrow('用户不存在')
    })

    it('throws when concurrent unlockedPoints insufficient in transaction', async () => {
      // 事务前:unlockedPoints=100
      mocks.user.findUnique.mockResolvedValueOnce({ id: 'user-1', level: 1, unlockedPoints: 100 } as any)
      // 事务内:unlockedPoints=0(并发消耗)
      mocks.user.findUnique.mockResolvedValueOnce({ id: 'user-1', unlockedPoints: 0 } as any)
      // product.updateMany 成功,user.updateMany 失败
      mocks.user.updateMany.mockResolvedValueOnce({ count: 0 })
      await expect(
        OrderService.createOrder({
          userId: 'user-1',
          items: [{ productId: 'p1', quantity: 1 }],
          pointsUsed: 50,
        })
      ).rejects.toThrow('可用积分不足')
    })
  })

  // ============ getUserOrders ============
  describe('getUserOrders', () => {
    it('returns paginated orders without status filter', async () => {
      mocks.order.findMany.mockResolvedValueOnce([{ id: 'o1' }] as any)
      mocks.order.count.mockResolvedValueOnce(1)
      const result = await OrderService.getUserOrders('user-1')
      expect(result.orders).toHaveLength(1)
      expect(result.pagination.total).toBe(1)
      expect(mocks.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      )
    })

    it('filters by status when provided', async () => {
      mocks.order.findMany.mockResolvedValueOnce([])
      mocks.order.count.mockResolvedValueOnce(0)
      await OrderService.getUserOrders('user-1', 'paid')
      expect(mocks.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', status: 'paid' } })
      )
    })

    it('uses custom page and limit', async () => {
      mocks.order.findMany.mockResolvedValueOnce([])
      mocks.order.count.mockResolvedValueOnce(0)
      await OrderService.getUserOrders('user-1', undefined, 3, 5)
      expect(mocks.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })
  })

  // ============ getOrderDetail ============
  describe('getOrderDetail', () => {
    it('returns order with relations', async () => {
      const order = { id: 'o1', user: {}, items: [], rewards: [], refundRequests: [] }
      mocks.order.findUnique.mockResolvedValueOnce(order as any)
      const result = await OrderService.getOrderDetail('o1')
      expect(result).toEqual(order)
      expect(mocks.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o1' },
          include: expect.objectContaining({
            user: true,
            items: expect.objectContaining({ include: { product: true } }),
            rewards: true,
            refundRequests: expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
          }),
        })
      )
    })
  })
})