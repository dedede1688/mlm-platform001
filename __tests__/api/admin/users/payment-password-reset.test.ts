import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  getUserById: vi.fn(),
  hasPaymentPassword: vi.fn(),
  resetPaymentPassword: vi.fn(),
  logOperation: vi.fn(),
  notifyPaymentPasswordReset: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({ verifyPermission: mocks.verifyPermission }))
vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    getUserById: mocks.getUserById,
    hasPaymentPassword: mocks.hasPaymentPassword,
    resetPaymentPassword: mocks.resetPaymentPassword,
  },
}))
vi.mock('@/lib/utils/operation-log', () => ({ logOperation: mocks.logOperation }))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: { notifyPaymentPasswordReset: mocks.notifyPaymentPasswordReset },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/users/u1/payment-password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin1', role: 'super_admin' }
const SUPPORT_ADMIN = { id: 'support1', role: 'support_admin' }
const TARGET_USER = {
  id: 'u1', phone: '13800008001', status: 'active',
  paymentPasswordHash: 'hashed_password_xxx',
}

describe('POST /api/admin/users/[id]/payment-password/reset', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('未登录返回 401', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: null, error: new Response(JSON.stringify({ success: false, error: '未登录' }), { status: 401 }) })
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(401)
  })

  it('support_admin 返回 403', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: SUPPORT_ADMIN, error: null })
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(403)
  })

  it('原因少于5字返回 400', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: 'aa', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
  })

  it('手机号后4位不匹配返回 400', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue(TARGET_USER)
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '9999' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
    expect(mocks.resetPaymentPassword).not.toHaveBeenCalled()
  })

  it('用户不存在返回 404', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue(null)
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(404)
  })

  it('已删除用户返回 404', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue({ ...TARGET_USER, status: 'deleted' })
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(404)
  })

  it('用户未设置支付密码返回 400', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue(TARGET_USER)
    mocks.hasPaymentPassword.mockResolvedValue(false)
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(400)
  })

  it('条件更新 count=0 返回 409', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue(TARGET_USER)
    mocks.hasPaymentPassword.mockResolvedValue(true)
    mocks.resetPaymentPassword.mockResolvedValue({ count: 0 })
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('CONFLICT')
  })

  it('成功重置返回 200', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue(TARGET_USER)
    mocks.hasPaymentPassword.mockResolvedValue(true)
    mocks.resetPaymentPassword.mockResolvedValue({ count: 1 })
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.hasPaymentPassword).toBe(false)
  })

  it('通知抛错时仍返回 200', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockResolvedValue(TARGET_USER)
    mocks.hasPaymentPassword.mockResolvedValue(true)
    mocks.resetPaymentPassword.mockResolvedValue({ count: 1 })
    mocks.notifyPaymentPasswordReset.mockRejectedValue(new Error('通知发送失败'))
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(200)
  })

  it('数据库异常返回 500', async () => {
    mocks.verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null })
    mocks.getUserById.mockRejectedValue(new Error('数据库连接断开'))
    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({ reason: '用户忘记密码申请重置', phoneSuffix: '8001' }), { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(500)
  })
})
