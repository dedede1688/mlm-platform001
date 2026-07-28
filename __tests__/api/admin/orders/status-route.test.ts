import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  getOrderById: vi.fn(),
  updateOrder: vi.fn(),
  cancelOrder: vi.fn(),
  shipOrder: vi.fn(),
  completeOrder: vi.fn(),
  logOperation: vi.fn(),
  notifyOrderShipped: vi.fn(),
  notifyOrderCompleted: vi.fn(),
  notifyOrderCancelled: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: mocks.verifyPermission,
}))
vi.mock('@/lib/services/order.service', () => ({
  OrderService: {
    getOrderById: mocks.getOrderById,
    updateOrder: mocks.updateOrder,
  },
}))
vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: {
    cancelOrder: mocks.cancelOrder,
    shipOrder: mocks.shipOrder,
    completeOrder: mocks.completeOrder,
  },
}))
vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: mocks.logOperation,
}))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyOrderShipped: mocks.notifyOrderShipped,
    notifyOrderCompleted: mocks.notifyOrderCompleted,
    notifyOrderCancelled: mocks.notifyOrderCancelled,
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/orders/order-1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

function makeParams() {
  return { params: Promise.resolve({ id: 'order-1' }) }
}

describe('PATCH /api/admin/orders/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyPermission.mockResolvedValue({
      user: { id: 'admin-1', role: 'super_admin' },
      error: null,
    })
    mocks.logOperation.mockResolvedValue(undefined)
  })

  it('rejects paid-to-cancelled without mutating the order', async () => {
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'paid',
      paidAt: new Date(),
    })

    const { PATCH } = await import('@/app/api/admin/orders/[id]/status/route')
    const response = await PATCH(makeRequest({ status: 'cancelled' }), makeParams())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('不允许从 paid 变更为 cancelled')
    expect(mocks.updateOrder).not.toHaveBeenCalled()
    expect(mocks.cancelOrder).not.toHaveBeenCalled()
  })

  it('delegates pending cancellation to cancelOrder', async () => {
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      paidAt: null,
    })
    mocks.cancelOrder.mockResolvedValue({
      id: 'order-1',
      status: 'cancelled',
    })

    const { PATCH } = await import('@/app/api/admin/orders/[id]/status/route')
    const response = await PATCH(makeRequest({ status: 'cancelled' }), makeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('cancelled')
    expect(mocks.cancelOrder).toHaveBeenCalledWith('order-1', '管理员取消')
    expect(mocks.updateOrder).not.toHaveBeenCalled()
    expect(mocks.notifyOrderCancelled).not.toHaveBeenCalled()
  })

  it('delegates paid shipping to shipOrder without duplicate notification', async () => {
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'paid',
      paidAt: new Date(),
    })
    mocks.shipOrder.mockResolvedValue({
      id: 'order-1',
      status: 'shipped',
      trackingNumber: 'SF123456',
    })

    const { PATCH } = await import('@/app/api/admin/orders/[id]/status/route')
    const response = await PATCH(
      makeRequest({ status: 'shipped', trackingNumber: ' SF123456 ' }),
      makeParams()
    )

    expect(response.status).toBe(200)
    expect(mocks.shipOrder).toHaveBeenCalledWith('order-1', 'SF123456')
    expect(mocks.updateOrder).not.toHaveBeenCalled()
    expect(mocks.notifyOrderShipped).not.toHaveBeenCalled()
  })

  it('delegates shipped completion to completeOrder without duplicate notification', async () => {
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'shipped',
      shippedAt: new Date(),
    })
    mocks.completeOrder.mockResolvedValue({
      id: 'order-1',
      status: 'completed',
    })

    const { PATCH } = await import('@/app/api/admin/orders/[id]/status/route')
    const response = await PATCH(makeRequest({ status: 'completed' }), makeParams())

    expect(response.status).toBe(200)
    expect(mocks.completeOrder).toHaveBeenCalledWith('order-1')
    expect(mocks.updateOrder).not.toHaveBeenCalled()
    expect(mocks.notifyOrderCompleted).not.toHaveBeenCalled()
  })

  it('returns a lifecycle conflict in the error field', async () => {
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      paidAt: null,
    })
    mocks.cancelOrder.mockRejectedValue(new Error('订单状态已变更，请刷新后重试'))

    const { PATCH } = await import('@/app/api/admin/orders/[id]/status/route')
    const response = await PATCH(makeRequest({ status: 'cancelled' }), makeParams())
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toBe('订单状态已变更，请刷新后重试')
  })
})
