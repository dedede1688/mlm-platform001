import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  getRefundRequestById: vi.fn(),
  reviewRefund: vi.fn(),
  logOperation: vi.fn(),
  notifyRefundReview: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: mocks.verifyPermission,
}))
vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: {
    getRefundRequestById: mocks.getRefundRequestById,
    reviewRefund: mocks.reviewRefund,
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
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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
    mocks.getRefundRequestById.mockResolvedValue({
      id: 'refund-1', userId: 'user-1', status: 'pending',
      order: { id: 'order-1', orderNo: 'ORD-1' },
    })
    mocks.reviewRefund.mockResolvedValue({
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
      expect(body.success).toBe(false)
      expect(body.error).toBe('拒绝原因至少5字')
      expect(mocks.reviewRefund).not.toHaveBeenCalled()
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
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('退款已拒绝')
    expect(mocks.reviewRefund).toHaveBeenCalledWith('refund-1', expect.objectContaining({
      action: 'reject',
      reviewedBy: 'admin-1',
      adminComment: '凭证无法证明问题',
    }))
  })

  it('通过审核时允许不填管理员备注', async () => {
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('退款审核通过')
  })

  it('通过审核时备注可选但会保存', async () => {
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'approve', adminComment: '情况核实通过' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(200)
    expect(mocks.reviewRefund).toHaveBeenCalledWith('refund-1', expect.objectContaining({
      action: 'approve',
      adminComment: '情况核实通过',
    }))
  })

  it('action 不在 approve/reject 中返回 400', async () => {
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'invalid' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('action 必须为 approve 或 reject')
  })

  it('退款已审核 (status != pending) 返回 400', async () => {
    mocks.getRefundRequestById.mockResolvedValue({
      id: 'refund-1', userId: 'user-1', status: 'approved',
      order: { id: 'order-1', orderNo: 'ORD-1' },
    })
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/review/route')
    const response = await PATCH(
      makePatchRequest({ action: 'reject', adminComment: '凭证无法证明问题' }),
      { params: Promise.resolve({ id: 'refund-1' }) }
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('退款申请已审核')
  })
})
