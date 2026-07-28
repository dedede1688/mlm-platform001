import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  getRefundRequestById: vi.fn(),
  completeApprovedRefund: vi.fn(),
  requestRefund: vi.fn(),
  completeRefund: vi.fn(),
  logOperation: vi.fn(),
  notifyRefundCompleted: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: mocks.verifyPermission,
}))
vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: {
    getRefundRequestById: mocks.getRefundRequestById,
    completeApprovedRefund: mocks.completeApprovedRefund,
    requestRefund: mocks.requestRefund,
    completeRefund: mocks.completeRefund,
  },
}))
vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: mocks.logOperation,
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyRefundCompleted: mocks.notifyRefundCompleted,
  },
}))
vi.mock('@/lib/utils/stats-cache', () => ({
  invalidateCache: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

function makeRequest() {
  return new Request('http://localhost/api/admin/refunds/refund-1/complete', {
    method: 'PATCH',
  }) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: 'refund-1' }) }
}

describe('PATCH /api/admin/refunds/[id]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyPermission.mockResolvedValue({
      user: { id: 'admin-1', role: 'finance_admin' },
      error: null,
    })
    mocks.getRefundRequestById.mockResolvedValue({
      id: 'refund-1',
      orderId: 'order-1',
      status: 'approved',
      order: {
        id: 'order-1',
        orderNo: 'ORD001',
        userId: 'user-1',
        payAmount: 500,
      },
    })
    mocks.completeApprovedRefund.mockResolvedValue({
      id: 'refund-1',
      status: 'completed',
    })
    mocks.requestRefund.mockResolvedValue(undefined)
    mocks.completeRefund.mockResolvedValue({
      id: 'refund-1',
      status: 'completed',
    })
    mocks.logOperation.mockResolvedValue(undefined)
    mocks.notifyRefundCompleted.mockResolvedValue(undefined)
  })

  it('uses the single atomic refund service', async () => {
    const { PATCH } = await import('@/app/api/admin/refunds/[id]/complete/route')
    const response = await PATCH(makeRequest(), makeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('completed')
    expect(mocks.completeApprovedRefund).toHaveBeenCalledWith('refund-1')
    expect(mocks.requestRefund).not.toHaveBeenCalled()
    expect(mocks.completeRefund).not.toHaveBeenCalled()
  })

  it.each(['log', 'notification'])(
    'keeps the committed refund successful when %s side effect fails',
    async sideEffect => {
      if (sideEffect === 'log') {
        mocks.logOperation.mockRejectedValueOnce(new Error('日志失败'))
      } else {
        mocks.notifyRefundCompleted.mockRejectedValueOnce(new Error('通知失败'))
      }

      const { PATCH } = await import('@/app/api/admin/refunds/[id]/complete/route')
      const response = await PATCH(makeRequest(), makeParams())
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data.status).toBe('completed')
    }
  )

  it('returns a known service conflict to the admin', async () => {
    mocks.completeApprovedRefund.mockRejectedValueOnce(
      new Error('当前订单状态不允许退款')
    )

    const { PATCH } = await import('@/app/api/admin/refunds/[id]/complete/route')
    const response = await PATCH(makeRequest(), makeParams())
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe('当前订单状态不允许退款')
  })

  it('keeps unknown failures generic', async () => {
    mocks.completeApprovedRefund.mockRejectedValueOnce(new Error('database secret'))

    const { PATCH } = await import('@/app/api/admin/refunds/[id]/complete/route')
    const response = await PATCH(makeRequest(), makeParams())
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('退款完成失败')
  })
})
