/**
 * 用户充值申请路由测试
 *
 * 重点验证：
 * 1. createRechargeRequest 成功后触发 notifyRechargeSubmitted
 * 2. 通知失败不影响接口成功
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock verifyToken
vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

// Mock RechargeService
const { createRechargeRequestMock } = vi.hoisted(() => ({
  createRechargeRequestMock: vi.fn(),
}))
vi.mock('@/lib/services/recharge.service', () => ({
  RechargeService: {
    createRechargeRequest: createRechargeRequestMock,
    getUserRechargeRequests: vi.fn(),
    getRechargeSettings: vi.fn(),
  },
}))

// Mock OrderNotificationService
const { notifyRechargeSubmittedMock } = vi.hoisted(() => ({
  notifyRechargeSubmittedMock: vi.fn(),
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyRechargeSubmitted: notifyRechargeSubmittedMock,
  },
}))

import { verifyToken } from '@/lib/utils/auth'
import { RechargeService } from '@/lib/services/recharge.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// 辅助：构造 NextRequest
function makePostRequest(body: Record<string, unknown>) {
  return {
    method: 'POST',
    json: async () => body,
    headers: new Headers(),
  } as any
}

describe('POST /api/user/recharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notifyRechargeSubmittedMock.mockResolvedValue(undefined)
  })

  it('createRechargeRequest 成功后触发 notifyRechargeSubmitted', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-1' } as any)
    createRechargeRequestMock.mockResolvedValueOnce({
      id: 'recharge-1',
      userId: 'user-1',
      amount: 500,
      status: 'pending',
      paymentMethod: 'qr_code',
      paymentProofUrl: 'https://example.com/proof.png',
      rejectReason: null,
      reviewedAt: null,
      approvedAt: null,
      createdAt: new Date(),
      remark: null,
    })

    const { POST } = await import('@/app/api/user/recharge/route')
    const res = await POST(makePostRequest({
      amount: 500,
      paymentProofUrl: 'https://example.com/proof.png',
    }))

    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // 验证通知被调用
    expect(OrderNotificationService.notifyRechargeSubmitted).toHaveBeenCalledWith({
      userId: 'user-1',
      rechargeId: 'recharge-1',
      amount: 500,
    })
  })

  it('通知失败不影响接口成功', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-2' } as any)
    createRechargeRequestMock.mockResolvedValueOnce({
      id: 'recharge-2',
      userId: 'user-2',
      amount: 300,
      status: 'pending',
      paymentMethod: 'qr_code',
      paymentProofUrl: 'https://example.com/proof.png',
      rejectReason: null,
      reviewedAt: null,
      approvedAt: null,
      createdAt: new Date(),
      remark: null,
    })
    // 通知抛错
    notifyRechargeSubmittedMock.mockRejectedValueOnce(new Error('通知发送失败'))

    const { POST } = await import('@/app/api/user/recharge/route')
    const res = await POST(makePostRequest({
      amount: 300,
      paymentProofUrl: 'https://example.com/proof.png',
    }))

    const data = await res.json()
    // 接口仍然成功
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // 通知确实被调用了
    expect(OrderNotificationService.notifyRechargeSubmitted).toHaveBeenCalled()
  })

  it('createRechargeRequest 失败时不触发通知', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'user-3' } as any)
    createRechargeRequestMock.mockRejectedValueOnce(new Error('充值服务暂时关闭'))

    const { POST } = await import('@/app/api/user/recharge/route')
    const res = await POST(makePostRequest({
      amount: 100,
      paymentProofUrl: 'https://example.com/proof.png',
    }))

    expect(res.status).toBe(400)
    expect(OrderNotificationService.notifyRechargeSubmitted).not.toHaveBeenCalled()
  })
})
