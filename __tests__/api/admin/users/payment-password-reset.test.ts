/**
 * 猫爪_018号任务：忘记支付密码的后台人工重置流程 - 接口失败测试
 *
 * 覆盖 16 个场景：
 * 1. 未登录返回 401
 * 2. support_admin 返回 403
 * 3. 非超级管理员不能执行
 * 4. 原因少于 5 个字返回 400
 * 5. 手机号后 4 位不是 4 位数字返回 400
 * 6. 手机号后 4 位不匹配返回 400，且不更新数据库
 * 7. 用户不存在返回 404
 * 8. 已删除用户返回 404
 * 9. 用户未设置支付密码返回 400
 * 10. 条件更新 count=0 返回 409
 * 11. 成功时只把 paymentPasswordHash 更新为 null
 * 12. 成功时登录密码和资金字段不参与更新
 * 13. 成功时写操作日志，日志含原因但不含任何密码值
 * 14. 成功时调用 notifyPaymentPasswordReset
 * 15. 通知抛错时仍返回 200
 * 16. 未知数据库异常返回 500
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== Mock 依赖 =====
vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyPaymentPasswordReset: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

// ===== 测试工具 =====

/** 构造请求 */
function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/users/u1/payment-password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ADMIN_USER = { id: 'admin1', role: 'super_admin' }
const SUPPORT_ADMIN = { id: 'support1', role: 'support_admin' }
const NORMAL_USER = {
  id: 'u1',
  phone: '13800008001',
  status: 'active',
  paymentPasswordHash: 'hashed_password_xxx',
  passwordHash: 'login_password_hash',
  balance: 1000,
  frozenBalance: 200,
  consumeBalance: 50,
  earningsAvailable: 300,
}
const DELETED_USER = {
  id: 'u1',
  phone: '13800008001',
  status: 'deleted',
  paymentPasswordHash: 'hashed_password_xxx',
}
const NO_PAYMENT_PWD_USER = {
  id: 'u1',
  phone: '13800008001',
  status: 'active',
  paymentPasswordHash: null,
}

describe('POST /api/admin/users/[id]/payment-password/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 恢复通知 mock 的默认 resolved 值
    ;(OrderNotificationService.notifyPaymentPasswordReset as any).mockResolvedValue(undefined)
  })

  // ===== 场景 1: 未登录返回 401 =====
  it('1. 未登录返回 401', async () => {
    verifyPermission.mockResolvedValue({
      user: null,
      error: new Response(JSON.stringify({ success: false, message: '未登录或登录已过期' }), { status: 401 }),
    } as any)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(401)
  })

  // ===== 场景 2: support_admin 返回 403 =====
  it('2. support_admin 返回 403', async () => {
    verifyPermission.mockResolvedValue({
      user: SUPPORT_ADMIN,
      error: new Response(JSON.stringify({ success: false, message: '权限不足' }), { status: 403 }),
    } as any)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(403)
  })

  // ===== 场景 3: 非超级管理员不能执行 =====
  it('3. 非超级管理员不能执行', async () => {
    // support_admin 通过了 verifyPermission（中间件），但接口内部再次校验
    verifyPermission.mockResolvedValue({
      user: SUPPORT_ADMIN,
      error: null,
    } as any)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    // 接口应该返回 403（因为内部要求 super_admin）
    expect(res.status).toBe(403)
  })

  // ===== 场景 4: 原因少于 5 个字返回 400 =====
  it('4. 原因少于 5 个字返回 400', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '太短',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 5: 手机号后 4 位不是 4 位数字返回 400 =====
  it('5. 手机号后 4 位不是 4 位数字返回 400', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')

    // 测试 3 位
    const res1 = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '800',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res1.status).toBe(400)

    // 测试 5 位
    const res2 = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '80012',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res2.status).toBe(400)

    // 测试非数字
    const res3 = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: 'abcd',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res3.status).toBe(400)
  })

  // ===== 场景 6: 手机号后 4 位不匹配返回 400，且不更新数据库 =====
  it('6. 手机号后 4 位不匹配返回 400，且不更新数据库', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '9999',  // 用户手机号后 4 位是 8001
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  // ===== 场景 7: 用户不存在返回 404 =====
  it('7. 用户不存在返回 404', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(null)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 8: 已删除用户返回 404 =====
  it('8. 已删除用户返回 404', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(DELETED_USER)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 9: 用户未设置支付密码返回 400 =====
  it('9. 用户未设置支付密码返回 400', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NO_PAYMENT_PWD_USER)

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 10: 条件更新 count=0 返回 409 =====
  it('10. 条件更新 count=0 返回 409', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)
    prisma.user.updateMany.mockResolvedValue({ count: 0 })

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 11: 成功时只把 paymentPasswordHash 更新为 null =====
  it('11. 成功时只把 paymentPasswordHash 更新为 null', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.hasPaymentPassword).toBe(false)

    // 验证 updateMany 只更新了 paymentPasswordHash
    const updateCall = (prisma.user.updateMany as any).mock.calls[0][0]
    expect(updateCall.data).toEqual({ paymentPasswordHash: null })
  })

  // ===== 场景 12: 成功时登录密码和资金字段不参与更新 =====
  it('12. 成功时登录密码和资金字段不参与更新', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    const updateCall = (prisma.user.updateMany as any).mock.calls[0][0]
    expect(updateCall.data).not.toHaveProperty('passwordHash')
    expect(updateCall.data).not.toHaveProperty('balance')
    expect(updateCall.data).not.toHaveProperty('frozenBalance')
    expect(updateCall.data).not.toHaveProperty('consumeBalance')
    expect(updateCall.data).not.toHaveProperty('earningsAvailable')
  })

  // ===== 场景 13: 成功时写操作日志，日志含原因但不含任何密码值 =====
  it('13. 成功时写操作日志，日志含原因但不含任何密码值', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(logOperation).toHaveBeenCalledOnce()
    const logCall = (logOperation as any).mock.calls[0][0]

    // 日志应包含原因
    expect(logCall.newValue.reason).toBe('用户本人联系客服申请重置')

    // 日志不应包含任何密码值
    const logStr = JSON.stringify(logCall)
    expect(logStr).not.toContain('paymentPasswordHash')
    expect(logStr).not.toContain('passwordHash')
    expect(logStr).not.toContain('hashed_password')
  })

  // ===== 场景 14: 成功时调用 notifyPaymentPasswordReset =====
  it('14. 成功时调用 notifyPaymentPasswordReset', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(OrderNotificationService.notifyPaymentPasswordReset).toHaveBeenCalledOnce()
    const notifyCall = (OrderNotificationService.notifyPaymentPasswordReset as any).mock.calls[0][0]
    expect(notifyCall.userId).toBe('u1')
    expect(notifyCall.operatorId).toBe('admin1')
  })

  // ===== 场景 15: 通知抛错时仍返回 200 =====
  it('15. 通知抛错时仍返回 200', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockResolvedValue(NORMAL_USER)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    // 模拟通知抛错
    ;(OrderNotificationService.notifyPaymentPasswordReset as any).mockRejectedValueOnce(
      new Error('通知服务内部爆炸')
    )

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    // 关键：密码清除已成功，接口必须返回 200 + success=true
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // ===== 场景 16: 未知数据库异常返回 500 =====
  it('16. 未知数据库异常返回 500', async () => {
    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)
    prisma.user.findUnique.mockRejectedValue(new Error('数据库连接断开'))

    const { POST } = await import('@/app/api/admin/users/[id]/payment-password/reset/route')
    const res = await POST(makeRequest({
      reason: '用户本人联系客服申请重置',
      phoneSuffix: '8001',
    }) as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
  })
})

// ===== 后台会员接口不泄露加密值测试 =====
describe('GET /api/admin/users - hasPaymentPassword 字段', () => {
  it('响应包含 hasPaymentPassword 布尔值', async () => {
    const { GET } = await import('@/app/api/admin/users/route')

    // 模拟 verifyPermission + prisma
    const mockUsers = [{
      id: 'u1',
      phone: '13800008001',
      nickname: null,
      level: 1,
      paymentPasswordHash: 'some_hash',
      // ... 其他字段
    }]

    prisma.user.findMany = vi.fn().mockResolvedValue(mockUsers) as any
    prisma.user.count = vi.fn().mockResolvedValue(1) as any

    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)

    const res = await GET(new Request('http://localhost/api/admin/users?page=1&pageSize=10') as any)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.data[0]).toHaveProperty('hasPaymentPassword')
    expect(data.data[0].hasPaymentPassword).toBe(true)
  })

  it('响应对象不含 paymentPasswordHash 敏感字段', async () => {
    const { GET } = await import('@/app/api/admin/users/route')

    const mockUsers = [{
      id: 'u1',
      phone: '13800008001',
      paymentPasswordHash: 'secret_hash',
      passwordHash: 'login_hash',
    }]

    prisma.user.findMany = vi.fn().mockResolvedValue(mockUsers) as any
    prisma.user.count = vi.fn().mockResolvedValue(1) as any

    verifyPermission.mockResolvedValue({ user: ADMIN_USER, error: null } as any)

    const res = await GET(new Request('http://localhost/api/admin/users?page=1&pageSize=10') as any)
    const data = await res.json()

    const userStr = JSON.stringify(data.data[0])
    expect(userStr).not.toContain('paymentPasswordHash')
    expect(userStr).not.toContain('passwordHash')
  })
})
