/**
 * 猫爪_019号任务：会员详情接口安全闭环测试
 *
 * 覆盖 16 个场景：
 * 1. support_admin 可以读取会员详情，返回 200
 * 2. super_admin 可以读取会员详情，返回 200
 * 3. prisma.user.findUnique 使用 select 字段白名单
 * 4. select 中不包含 passwordHash
 * 5. 接口可读取 paymentPasswordHash，但响应中不包含该字段
 * 6. paymentPasswordHash 非空时，响应 hasPaymentPassword === true
 * 7. paymentPasswordHash 为空时，响应 hasPaymentPassword === false
 * 8. 响应序列化文本不包含 passwordHash
 * 9. 响应序列化文本不包含 paymentPasswordHash
 * 10. 原有会员详情标量字段仍返回
 * 11. 原有关系列表仍返回
 * 12. 原有订单统计仍返回
 * 13. 用户不存在返回 404
 * 14. 用户状态为 deleted 返回 404
 * 15. 数据库未知异常返回 500
 * 16. PUT 更新会员等级行为仍然存在且权限不变
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
    },
    order: {
      aggregate: vi.fn(),
    },
  },
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// ===== 测试工具 =====

function makeRequest() {
  return new Request('http://localhost/api/admin/users/u1', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

const SUPER_ADMIN = { id: 'admin1', role: 'super_admin' }
const SUPPORT_ADMIN = { id: 'support1', role: 'support_admin' }

const FULL_USER = {
  id: 'u1',
  phone: '13800008001',
  email: 'test@example.com',
  nickname: '测试用户',
  avatarUrl: null,
  level: 1,
  referrerId: 'ref1',
  parentId: 'p1',
  position: 1,
  balance: 1000,
  frozenBalance: 200,
  consumeBalance: 50,
  earningsPending: 300,
  earningsAvailable: 500,
  earningsFrozen: 100,
  earningsVoided: 50,
  totalPoints: 1000,
  unlockedPoints: 800,
  lockedPoints: 200,
  upgradeProductCount: 5,
  directSalesAmount: 5000,
  directDistributorCount: 3,
  role: 'user',
  status: 'active',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
  passwordHash: 'login_password_hash_should_never_leave_db',
  paymentPasswordHash: 'payment_password_hash_should_never_leave_db',
  referrer: { id: 'ref1', phone: '13900000000', nickname: '推荐人', level: 2 },
  parent: { id: 'p1', phone: '13700000000', nickname: '安置上级', level: 3 },
  referrals: [
    { id: 'r1', phone: '13500000001', nickname: '直推1', level: 1, createdAt: new Date('2025-02-01') },
  ],
  children: [
    { id: 'c1', phone: '13600000001', nickname: '下级1', level: 1, position: 1 },
  ],
}

const ORDER_STATS = {
  _count: 5,
  _sum: { payAmount: 2500 },
}

// v020: 模拟 Prisma select 字段白名单投影（仅顶层标量+关系字段）
function applyTopLevelSelect(record: Record<string, unknown>, select: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(select).map(key => [key, record[key]])
  )
}

// v020: 使用 select 投影的 mock 辅助函数
function mockFindUniqueWithSelect(record: Record<string, unknown>) {
  ;(prisma.user.findUnique as any).mockImplementation((args: any) => {
    return Promise.resolve(applyTopLevelSelect(record, args.select))
  })
}

describe('GET /api/admin/users/[id] — 会员详情接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===== 场景 1: support_admin 可以读取会员详情 =====
  it('1. support_admin 可以读取会员详情，返回 200', async () => {
    verifyPermission.mockResolvedValue({ user: SUPPORT_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // ===== 场景 2: super_admin 可以读取会员详情 =====
  it('2. super_admin 可以读取会员详情，返回 200', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // ===== 场景 3: findUnique 使用 select 字段白名单 =====
  it('3. prisma.user.findUnique 使用 select 字段白名单（不是 include）', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    const findCall = (prisma.user.findUnique as any).mock.calls[0][0]
    expect(findCall).toHaveProperty('select')
    expect(findCall).not.toHaveProperty('include')
  })

  // ===== 场景 4: select 中不包含 passwordHash =====
  it('4. select 中不包含 passwordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    const findCall = (prisma.user.findUnique as any).mock.calls[0][0]
    const selectStr = JSON.stringify(findCall.select)
    expect(selectStr).not.toContain('passwordHash')
  })

  // ===== 场景 5: 接口可读取 paymentPasswordHash，但响应中不包含该字段 =====
  it('5. select 包含 paymentPasswordHash 但响应中不包含该字段', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    // select 中应该包含 paymentPasswordHash（用于计算布尔值）
    const findCall = (prisma.user.findUnique as any).mock.calls[0][0]
    expect(findCall.select).toHaveProperty('paymentPasswordHash')

    // 响应中不应该包含 paymentPasswordHash
    expect(data.data).not.toHaveProperty('paymentPasswordHash')
  })

  // ===== 场景 6: paymentPasswordHash 非空时 hasPaymentPassword === true =====
  it('6. paymentPasswordHash 非空时 hasPaymentPassword === true', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect({ ...FULL_USER, paymentPasswordHash: 'some_hash' })
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data.hasPaymentPassword).toBe(true)
  })

  // ===== 场景 7: paymentPasswordHash 为空时 hasPaymentPassword === false =====
  it('7. paymentPasswordHash 为空时 hasPaymentPassword === false', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect({ ...FULL_USER, paymentPasswordHash: null })
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data.hasPaymentPassword).toBe(false)
  })

  // ===== 场景 8: 响应序列化文本不包含 passwordHash =====
  it('8. 响应序列化文本不包含 passwordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const text = await res.text()

    expect(text).not.toContain('passwordHash')
  })

  // ===== v020 场景 8a: DB 原始记录真实包含 passwordHash，验证 select 排除 =====
  it('8a. DB 原始记录真实包含 passwordHash，select 投影排除后路由拿不到', async () => {
    // 证据 1: 原始数据库记录真实包含 passwordHash
    expect(FULL_USER.passwordHash).toBe('login_password_hash_should_never_leave_db')

    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const text = await res.text()

    // 证据 2: select 中不包含 passwordHash
    const findCall = (prisma.user.findUnique as any).mock.calls[0][0]
    const selectStr = JSON.stringify(findCall.select)
    expect(selectStr).not.toContain('passwordHash')

    // 证据 3: mock 投影后的返回值不含 passwordHash（模拟 Prisma select 白名单效果）
    const mockReturn = await (prisma.user.findUnique as any).mock.results[0].value
    expect(mockReturn).not.toHaveProperty('passwordHash')

    // 证据 4: 最终响应序列化文本不含 passwordHash
    expect(text).not.toContain('passwordHash')
  })

  // ===== 场景 9: 响应序列化文本不包含 paymentPasswordHash =====
  it('9. 响应序列化文本不包含 paymentPasswordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const text = await res.text()

    expect(text).not.toContain('paymentPasswordHash')
  })

  // ===== v020 场景 9a: DB 原始记录真实包含 paymentPasswordHash，验证转布尔后移除 =====
  it('9a. DB 原始记录真实包含 paymentPasswordHash，select 包含但响应移除后含 hasPaymentPassword', async () => {
    // 证据 5: 原始数据库记录真实包含 paymentPasswordHash
    expect(FULL_USER.paymentPasswordHash).toBe('payment_password_hash_should_never_leave_db')

    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const text = await res.text()
    const data = JSON.parse(text)

    // 证据 6: select 包含 paymentPasswordHash（供路由计算布尔状态）
    const findCall = (prisma.user.findUnique as any).mock.calls[0][0]
    expect(findCall.select).toHaveProperty('paymentPasswordHash')

    // 证据 7: 响应不含 paymentPasswordHash
    expect(text).not.toContain('paymentPasswordHash')

    // 证据 8: 响应包含 hasPaymentPassword: true（因为 DB 记录有 hash）
    expect(data.data.hasPaymentPassword).toBe(true)
    expect(data.data).not.toHaveProperty('paymentPasswordHash')
  })

  // ===== 场景 10: 原有标量字段仍返回 =====
  it('10. 原有标量字段仍返回（id/phone/nickname/level/balance/earningsAvailable/status）', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).toHaveProperty('id')
    expect(data.data).toHaveProperty('phone')
    expect(data.data).toHaveProperty('nickname')
    expect(data.data).toHaveProperty('level')
    expect(data.data).toHaveProperty('balance')
    expect(data.data).toHaveProperty('earningsAvailable')
    expect(data.data).toHaveProperty('status')
  })

  // ===== 场景 11: 原有关系列表仍返回 =====
  it('11. 原有关系列表仍返回（referrer/parent/referrals/children）', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).toHaveProperty('referrer')
    expect(data.data).toHaveProperty('parent')
    expect(data.data).toHaveProperty('referrals')
    expect(data.data).toHaveProperty('children')
  })

  // ===== 场景 12: 原有订单统计仍返回 =====
  it('12. 原有订单统计仍返回（orderCount/totalOrderAmount）', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect(FULL_USER)
    ;(prisma.order.aggregate as any).mockResolvedValue(ORDER_STATS)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).toHaveProperty('orderCount')
    expect(data.data).toHaveProperty('totalOrderAmount')
    expect(data.data.orderCount).toBe(5)
    expect(data.data.totalOrderAmount).toBe(2500)
  })

  // ===== 场景 13: 用户不存在返回 404 =====
  it('13. 用户不存在返回 404', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    ;(prisma.user.findUnique as any).mockResolvedValue(null)

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 14: 用户状态为 deleted 返回 404 =====
  it('14. 用户状态为 deleted 返回 404', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    mockFindUniqueWithSelect({ ...FULL_USER, status: 'deleted' })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 15: 数据库未知异常返回 500 =====
  it('15. 数据库未知异常返回 500', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null } as any)
    ;(prisma.user.findUnique as any).mockRejectedValue(new Error('数据库连接断开'))

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== 场景 16: PUT 更新会员等级行为仍然存在且权限不变 =====
  it('16. PUT 路由仍存在且权限为 support_admin + super_admin', async () => {
    const module = await import('@/app/api/admin/users/[id]/route')
    expect(typeof module.PUT).toBe('function')

    // 验证 PUT 使用的权限仍是 ['support_admin', 'super_admin']
    verifyPermission.mockResolvedValue({ user: SUPPORT_ADMIN, error: null } as any)
    ;(prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', status: 'active', level: 1 })

    const putReq = new Request('http://localhost/api/admin/users/u1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 2 }),
    })

    // PUT 内部会调用 update，但我们 mock 的 prisma.user 没有 update 方法
    // 这里只验证 verifyPermission 被调用时传入了正确的角色
    try {
      await module.PUT(putReq as any, { params: Promise.resolve({ id: 'u1' }) })
    } catch {
      // 预期会因为 prisma.user.update 未 mock 而抛错
    }

    const permCall = (verifyPermission as any).mock.calls[0]
    expect(permCall[1]).toEqual(['support_admin', 'super_admin'])
  })
})
