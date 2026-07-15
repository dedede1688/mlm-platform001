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

describe('POST /api/orders/[id]/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      })

      prisma.refundRequest.findFirst.mockResolvedValueOnce({
        id: 'refund-pending',
        orderId,
        status: 'pending',
      })

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
      })

      prisma.refundRequest.findFirst.mockResolvedValueOnce({
        id: 'refund-approved',
        orderId,
        status: 'approved',
      })

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
      })

      prisma.refundRequest.findFirst.mockResolvedValueOnce(null)

      prisma.refundRequest.create.mockResolvedValueOnce({
        id: 'refund-new',
        orderId,
        status: 'pending',
        reason: '重新申请',
      })

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
      })

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
      })

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
})