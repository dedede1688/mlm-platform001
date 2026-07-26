import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  createRefundRequest: vi.fn(),
  getOrderRefunds: vi.fn(),
  validateRefundApplication: vi.fn(),
}))

vi.mock('@/lib/utils/auth', () => ({ verifyToken: mocks.verifyToken }))
vi.mock('@/lib/services/order-lifecycle.service', () => ({
  OrderLifecycleService: {
    createRefundRequest: mocks.createRefundRequest,
    getOrderRefunds: mocks.getOrderRefunds,
  },
}))
vi.mock('@/lib/refunds/refund-validation', () => ({
  validateRefundApplication: mocks.validateRefundApplication,
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

function makePostRequest(body: Record<string, unknown>) {
  return { method: 'POST', json: async () => body, headers: new Headers() } as any
}
function makeGetRequest() {
  return { method: 'GET', headers: new Headers() } as any
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const orderId = 'order-1'
const userId = 'user-1'

describe('POST /api/orders/[id]/refund', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('validation', () => {
    it('未登录返回 401', async () => {
      mocks.verifyToken.mockResolvedValue(null)
      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(makePostRequest({ reason: 'test' }), makeParams(orderId))
      expect(res.status).toBe(401)
    })

    it('validation 失败返回 400', async () => {
      mocks.verifyToken.mockResolvedValue({ userId, role: 'user' })
      mocks.validateRefundApplication.mockReturnValue({ success: false, error: '退款原因不能为空' })

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(makePostRequest({ reason: '' }), makeParams(orderId))
      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
    })
  })

  describe('create refund', () => {
    it('创建退款申请成功', async () => {
      mocks.verifyToken.mockResolvedValue({ userId, role: 'user' })
      mocks.validateRefundApplication.mockReturnValue({
        success: true,
        data: { reason: '未按约定时间发货', description: '', images: [] },
      })
      mocks.createRefundRequest.mockResolvedValue({
        id: 'refund-1', orderId, userId,
        reason: '未按约定时间发货', status: 'pending',
      })

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(makePostRequest({ reason: '未按约定时间发货' }), makeParams(orderId))
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mocks.createRefundRequest).toHaveBeenCalledWith(orderId, userId, expect.objectContaining({
        reason: '未按约定时间发货',
      }))
    })

    it('创建退款失败返回 400', async () => {
      mocks.verifyToken.mockResolvedValue({ userId, role: 'user' })
      mocks.validateRefundApplication.mockReturnValue({
        success: true,
        data: { reason: '未按约定时间发货', description: '', images: [] },
      })
      mocks.createRefundRequest.mockRejectedValue(new Error('该订单已有处理中的退款申请'))

      const { POST } = await import('@/app/api/orders/[id]/refund/route')
      const res = await POST(makePostRequest({ reason: '未按约定时间发货' }), makeParams(orderId))
      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('退款')
    })
  })
})

describe('GET /api/orders/[id]/refund', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('未登录返回 401', async () => {
    mocks.verifyToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/orders/[id]/refund/route')
    const res = await GET(makeGetRequest(), makeParams(orderId))
    expect(res.status).toBe(401)
  })

  it('获取退款列表成功', async () => {
    mocks.verifyToken.mockResolvedValue({ userId, role: 'user' })
    mocks.getOrderRefunds.mockResolvedValue([
      { id: 'refund-1', orderId, status: 'pending', reason: 'test' },
    ])

    const { GET } = await import('@/app/api/orders/[id]/refund/route')
    const res = await GET(makeGetRequest(), makeParams(orderId))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })
})
