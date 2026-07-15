import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getOrderDetail: vi.fn(),
}))

vi.mock('@/lib/utils/auth', () => ({
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/lib/services/order.service', () => ({
  OrderService: {
    getOrderDetail: mocks.getOrderDetail,
  },
}))

import { GET } from '@/app/api/orders/[id]/route'

function makeRequest(url: string) {
  return new Request(url, { method: 'GET' })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const unsafeOrder = {
  id: 'order-1',
  userId: 'user-1',
  orderNo: 'NO001',
  totalAmount: 500,
  pointsUsed: 0,
  pointsDiscount: 0,
  payAmount: 500,
  status: 'pending',
  trackingNumber: null,
  paidAt: null,
  shippedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-07-14T00:00:00Z'),
  recipientName: '胡子',
  recipientPhone: '13800138001',
  shippingAddress: '广东省 广州市 白云区 详细地址',
  items: [{
    id: 'item-1',
    productId: 'product-1',
    quantity: 1,
    unitPrice: 500,
    totalPrice: 500,
    product: { id: 'product-1', name: '测试商品', imageUrl: null },
  }],
  refundRequests: [],
  user: {
    id: 'user-1',
    passwordHash: 'LOGIN_SECRET',
    paymentPasswordHash: 'PAY_SECRET',
  },
  passwordHash: 'ROOT_LOGIN_SECRET',
  paymentPasswordHash: 'ROOT_PAY_SECRET',
}

describe('GET /api/orders/[id] - security whitelist', () => {
  beforeEach(() => {
    mocks.verifyToken.mockReset()
    mocks.getOrderDetail.mockReset()
  })

  it('does not leak passwordHash or paymentPasswordHash in response', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'user-1', role: 'user' })
    mocks.getOrderDetail.mockResolvedValue(unsafeOrder)

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))
    const responseText = await response.text()

    expect(response.status).toBe(200)
    expect(responseText).not.toContain('LOGIN_SECRET')
    expect(responseText).not.toContain('PAY_SECRET')
    expect(responseText).not.toContain('passwordHash')
    expect(responseText).not.toContain('paymentPasswordHash')

    const body = JSON.parse(responseText)
    expect(body.data).not.toHaveProperty('userId')
    expect(body.data).not.toHaveProperty('user')
    expect(body.data.items[0].product.name).toBe('测试商品')
    expect(body.data.recipientPhone).toBe('13800138001')
  })

  it('returns 401 when not logged in', async () => {
    mocks.verifyToken.mockResolvedValue(null)

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))

    expect(response.status).toBe(401)
  })

  it('returns 404 when order not found', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'user-1', role: 'user' })
    mocks.getOrderDetail.mockResolvedValue(null)

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))

    expect(response.status).toBe(404)
  })

  it('returns 403 when user does not own the order', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'other-user', role: 'user' })
    mocks.getOrderDetail.mockResolvedValue(unsafeOrder)

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))

    expect(response.status).toBe(403)
  })

  it('returns 500 when service throws', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'user-1', role: 'user' })
    mocks.getOrderDetail.mockRejectedValue(new Error('DB down'))

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))

    expect(response.status).toBe(500)
  })

  it('allows admin to view any order without userId in response', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'admin-1', role: 'super_admin' })
    mocks.getOrderDetail.mockResolvedValue(unsafeOrder)

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).not.toHaveProperty('userId')
    expect(body.data).not.toHaveProperty('user')
    expect(body.data).not.toHaveProperty('passwordHash')
    expect(body.data).not.toHaveProperty('paymentPasswordHash')
  })

  it('includes paymentVerified in response (P0-2)', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'user-1', role: 'user' })
    mocks.getOrderDetail.mockResolvedValue({
      ...unsafeOrder,
      paymentVerified: true,
    })

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('paymentVerified', true)
  })

  it('includes paymentVerified=false in response when not verified (P0-2)', async () => {
    mocks.verifyToken.mockResolvedValue({ userId: 'user-1', role: 'user' })
    mocks.getOrderDetail.mockResolvedValue({
      ...unsafeOrder,
      paymentVerified: false,
    })

    const request = makeRequest('http://localhost/api/orders/order-1')
    const response = await GET(request as any, makeParams('order-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('paymentVerified', false)
  })
})