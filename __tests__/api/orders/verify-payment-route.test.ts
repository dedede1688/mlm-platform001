import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  verifyPayment: vi.fn(),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetIn: 0 }),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitResponse: vi.fn(),
  invalidateCache: vi.fn(),
}))

vi.mock('@/lib/utils/auth', () => ({ verifyToken: mocks.verifyToken }))
vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: { verifyPayment: mocks.verifyPayment },
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIP: mocks.getClientIP,
  rateLimitResponse: mocks.rateLimitResponse,
}))
vi.mock('@/lib/utils/stats-cache', () => ({ invalidateCache: mocks.invalidateCache }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

function makePostRequest(body: Record<string, unknown>) {
  return { method: 'POST', json: async () => body, headers: new Headers() } as any
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const orderId = 'order-1'
const userId = 'user-1'

describe('POST /api/orders/[id]/verify-payment', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('余额不足时返回 code=INSUFFICIENT_BALANCE + 400', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.verifyPayment.mockRejectedValue(new Error('可用余额不足'))

    const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
    const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.code).toBe('INSUFFICIENT_BALANCE')
  })

  it('支付密码错误返回 401', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.verifyPayment.mockRejectedValue(new Error('支付密码错误'))

    const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
    const res = await POST(makePostRequest({ password: 'wrong' }), makeParams(orderId))
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.success).toBe(false)
  })

  it('未登录返回 401', async () => {
    mocks.verifyToken.mockResolvedValue(null)

    const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
    const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.success).toBe(false)
  })

  it('其他错误返回 500', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.verifyPayment.mockRejectedValue(new Error('订单不存在'))

    const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
    const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.success).toBe(false)
  })

  it('余额充足时支付成功', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.verifyPayment.mockResolvedValue({
      id: orderId, orderNo: 'ORD-1', status: 'paid',
      userId, payAmount: 500, unlockRequired: false,
    })

    const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
    const res = await POST(makePostRequest({ password: '123456' }), makeParams(orderId))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.orderId).toBe(orderId)
  })

  it('存量字母数字密码 legacyA1 原样传入 OrderLifecycleService.verifyPayment', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, phone: '138' })
    mocks.verifyPayment.mockResolvedValue({
      id: orderId, orderNo: 'ORD-1', status: 'paid',
      userId, payAmount: 500, unlockRequired: false,
    })

    const { POST } = await import('@/app/api/orders/[id]/verify-payment/route')
    const res = await POST(makePostRequest({ password: 'legacyA1' }), makeParams(orderId))

    expect(res.status).toBe(200)
    expect(mocks.verifyPayment).toHaveBeenCalledWith(orderId, userId, 'legacyA1')
  })
})
