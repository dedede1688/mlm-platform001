import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    order: {
      findUnique: vi.fn(),
    },
    refundRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyRefundSubmitted: vi.fn().mockResolvedValue(undefined),
  },
}))

import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

function makePostRequest(body: Record<string, unknown>) {
  return {
    method: 'POST',
    json: async () => body,
    headers: new Headers(),
  } as any
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function mockRefundableOrder(userId = 'user-1', orderId = 'order-1') {
  vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)
  prisma.order.findUnique.mockResolvedValueOnce({
    id: orderId,
    userId,
    status: 'paid',
    payAmount: 500,
  } as any)
  prisma.refundRequest.findFirst.mockResolvedValueOnce(null)
}

describe('POST /api/orders/[id]/refund', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(OrderNotificationService.notifyRefundSubmitted).mockResolvedValue(undefined)
  })

  describe('防重复退款申请拦截', () => {
    it('已有 pending 退款时拒绝重复申请', async () => {
      const userId = 'user-1'
      const orderId = 'order-1'

      vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        userId,
        status: 'paid',
        payAmount: 100,
      } as any)

      prisma.refundRequest.findFirst.mockResolvedValueOnce({
        id: 'refund-pending',
        orderId,
        status: 'pending',
      } as any)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '不想要了' }),
        makeParams(orderId)
      )

      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('该订单已有进行中的退款申请')
    })

    it('已有 approved 退款时拒绝重复申请', async () => {
      const userId = 'user-2'
      const orderId = 'order-2'

      vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        userId,
        status: 'paid',
        payAmount: 200,
      } as any)

      prisma.refundRequest.findFirst.mockResolvedValueOnce({
        id: 'refund-approved',
        orderId,
        status: 'approved',
      } as any)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '质量问题' }),
        makeParams(orderId)
      )

      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('该订单已有进行中的退款申请')
    })

    it('已有 rejected 退款时允许重新申请', async () => {
      const userId = 'user-3'
      const orderId = 'order-3'

      vi.mocked(verifyToken).mockResolvedValueOnce({ userId } as any)

      prisma.order.findUnique.mockResolvedValueOnce({
        id: orderId,
        userId,
        status: 'paid',
        payAmount: 300,
      } as any)

      prisma.refundRequest.findFirst.mockResolvedValueOnce(null)

      prisma.refundRequest.create.mockResolvedValueOnce({
        id: 'refund-new',
        orderId,
        status: 'pending',
        reason: '重新申请',
      } as any)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '重新申请' }),
        makeParams(orderId)
      )

      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('非重复拦截的错误路径', () => {
    it('未登录返回 401', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: 'test' }),
        makeParams('order-x')
      )

      const data = await res.json()
      expect(res.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('未登录')
    })

    it('订单不存在返回 404', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u1' } as any)
      prisma.order.findUnique.mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: 'test' }),
        makeParams('nonexistent')
      )

      const data = await res.json()
      expect(res.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe('订单不存在')
    })

    it('非本人订单返回 403', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-a' } as any)
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-b',
        userId: 'user-b',
        status: 'paid',
        payAmount: 100,
      } as any)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: 'test' }),
        makeParams('order-b')
      )

      const data = await res.json()
      expect(res.status).toBe(403)
      expect(data.success).toBe(false)
      expect(data.error).toBe('无权操作')
    })

    it('订单状态不可退款返回 400', async () => {
      vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-c' } as any)
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-c',
        userId: 'user-c',
        status: 'pending',
        payAmount: 100,
      } as any)

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: 'test' }),
        makeParams('order-c')
      )

      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('当前订单状态不可申请退款')
    })
  })

  describe('退款凭证校验', () => {
    it.each(['质量问题', '商品损坏'])(
      '%s 无图片返回400且无副作用',
      async (reason) => {
        mockRefundableOrder()
        const { POST } = await import('@/app/api/orders/[id]/refund/route')
        const res = await POST(
          makePostRequest({ reason, images: [] }),
          makeParams('order-1')
        )
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('该退款原因至少需要上传1张凭证图片')
        expect(prisma.refundRequest.create).not.toHaveBeenCalled()
        expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
      }
    )

    it('其他原因无补充说明返回400且无副作用', async () => {
      mockRefundableOrder()
      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '其他', description: '  ' }),
        makeParams('order-1')
      )
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('选择其他原因时请填写补充说明')
      expect(prisma.refundRequest.create).not.toHaveBeenCalled()
      expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
    })

    it.each([
      { images: 'https://example.com/a.jpg', error: '凭证图片格式不正确' },
      { images: [123], error: '凭证图片格式不正确' },
      { images: [''], error: '凭证图片不能为空' },
      { images: ['1', '2', '3', '4', '5', '6'], error: '凭证图片最多上传5张' },
    ])('非法图片输入返回400且无副作用 %#', async ({ images, error }) => {
      mockRefundableOrder()
      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '未按约定时间发货', images }),
        makeParams('order-1')
      )
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(error)
      expect(prisma.refundRequest.create).not.toHaveBeenCalled()
      expect(OrderNotificationService.notifyRefundSubmitted).not.toHaveBeenCalled()
    })

    it('未按约定时间发货无图可创建', async () => {
      mockRefundableOrder()
      prisma.refundRequest.create.mockResolvedValueOnce({
        id: 'refund-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 500,
        reason: '未按约定时间发货',
        description: null,
        images: null,
        status: 'pending',
      } as any)
      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '未按约定时间发货' }),
        makeParams('order-1')
      )
      expect(res.status).toBe(200)
      expect(prisma.refundRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason: '未按约定时间发货',
          description: null,
          status: 'pending',
        }),
      })
    })

    it('质量问题有1张图片可创建且只保存本次图片', async () => {
      mockRefundableOrder()
      prisma.refundRequest.create.mockResolvedValueOnce({
        id: 'refund-2',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 500,
        reason: '质量问题',
        description: null,
        images: ['https://example.com/new.jpg'],
        status: 'pending',
      } as any)
      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(
        makePostRequest({ reason: '质量问题', images: ['https://example.com/new.jpg'] }),
        makeParams('order-1')
      )
      expect(res.status).toBe(200)
      expect(prisma.refundRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          images: ['https://example.com/new.jpg'],
        }),
      })
    })
  })
})
