import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  logOperation: vi.fn(),
  notifyRefundReview: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: mocks.verifyPermission,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    refundRequest: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}))
vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: mocks.logOperation,
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyRefundReview: mocks.notifyRefundReview,
  },
}))

function makePatchRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: new Headers(),
  } as any
}

describe('PATCH /api/admin/refunds/[id]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyPermission.mockResolvedValue({
      user: { id: 'admin-1', role: 'finance_admin' },
      error: null,
    })
    mocks.findUnique.mockResolvedValue({
      id: 'refund-1', userId: 'user-1', status: 'pending',
      order: { id: 'order-1', orderNo: 'ORD-1' },
    })
    mocks.update.mockResolvedValue({
      id: 'refund-1', userId: 'user-1', status: 'rejected',
      adminComment: '凭证无法证明问题',
    })
    mocks.logOperation.mockResolvedValue(undefined)
    mocks.notifyRefundReview.mockResolvedValue(undefined)
  })

  it.each([undefined, '', '   ', '不足'])(
    '拒绝原因 %j 不足5字时返回400且无副作用',
    async adminComment => {
      const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
      const response = await PATCH(
        makePatchRequest({ action: 'reject', adminComment }),
        { params: Promise.resolve({ id: 'refund-1' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.message).toBe('拒绝原因至少填写5个字符')
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.logOperation).not.toHaveBeenCalled()
      expect(mocks.notifyRefundReview).not.toHaveBeenCalled()
    }
  )

  it('拒绝原因满足5字时保留原审核流程', async () => {
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'reject', adminComment: '  凭证无法证明问题  ' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: { status: 'rejected', adminComment: '凭证无法证明问题' },
    })
    expect(mocks.logOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REJECT',
        newValue: { status: 'rejected', adminComment: '凭证无法证明问题' },
      })
    )
    expect(mocks.notifyRefundReview).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reject',
        adminComment: '凭证无法证明问题',
        orderId: 'order-1',
        orderNo: 'ORD-1',
      })
    )
  })

  it('通过审核时允许不填管理员备注', async () => {
    mocks.update.mockResolvedValueOnce({
      id: 'refund-1', userId: 'user-1', status: 'approved', adminComment: null,
    })
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: { status: 'approved', adminComment: null },
    })
  })

  it('通过审核时备注可选但会保存', async () => {
    mocks.update.mockResolvedValueOnce({
      id: 'refund-1', userId: 'user-1', status: 'approved', adminComment: '情况核实通过',
    })
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve', adminComment: '  情况核实通过  ' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: { status: 'approved', adminComment: '情况核实通过' },
    })
  })

  it('未鉴权时返回401', async () => {
    mocks.verifyPermission.mockResolvedValue({
      user: null,
      error: NextResponse.json({ success: false, message: '未授权' }, { status: 401 }),
    })
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(401)
  })

  it('退款申请不存在时返回404', async () => {
    mocks.findUnique.mockResolvedValueOnce(null)
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve' }),
      { params: Promise.resolve({ id: 'nonexistent' }) }
    )
    expect(response.status).toBe(404)
  })

  it('非pending状态返回400', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: 'refund-1', userId: 'user-1', status: 'approved',
      order: { id: 'order-1', orderNo: 'ORD-1' },
    })
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(400)
  })
})

import { NextResponse } from 'next/server'