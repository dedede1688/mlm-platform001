/**
 * ??_019????????????????
 *
 * ?? 16 ????
 * 1. support_admin ??????????? 200
 * 2. super_admin ??????????? 200
 * 3. ?????? passwordHash
 * 4. ?????? paymentPasswordHash
 * 5. paymentPasswordHash ??? hasPaymentPassword === true
 * 6. paymentPasswordHash ??? hasPaymentPassword === false
 * 7. ??????? passwordHash
 * 8. ??????? paymentPasswordHash
 * 9. ?????????????
 * 10. ?????????
 * 11. ?????????
 * 12. ??????? 404
 * 13. ????? deleted ?? 404
 * 14. ????????? 500
 * 15. PUT ????????? support_admin + super_admin
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== Mock ?? =====
vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Mock UserService ? route now delegates to UserService instead of prisma directly
vi.mock('@/lib/services/user.service', () => ({
  UserService: {
    getUserDetail: vi.fn(),
    getUserById: vi.fn(),
    updateUserLevel: vi.fn(),
  },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { UserService } from '@/lib/services/user.service'

// ===== ???? =====

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
  nickname: '????',
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
  referrer: { id: 'ref1', phone: '13900000000', nickname: '???', level: 2 },
  parent: { id: 'p1', phone: '13700000000', nickname: '????', level: 3 },
  referrals: [
    { id: 'r1', phone: '13500000001', nickname: '??1', level: 1, createdAt: new Date('2025-02-01') },
  ],
  children: [
    { id: 'c1', phone: '13600000001', nickname: '??1', level: 1, position: 1 },
  ],
}

const ORDER_STATS = {
  _count: 5,
  _sum: { payAmount: 2500 },
}

const DELETED_USER = { ...FULL_USER, status: 'deleted', passwordHash: 'hash', paymentPasswordHash: 'hash' }

// ===== ?? =====

describe('GET /api/admin/users/[id] ? ??????', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===== ?? 1: support_admin ???????? =====
  it('1. support_admin ??????????? 200', async () => {
    verifyPermission.mockResolvedValue({ user: SUPPORT_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // ===== ?? 2: super_admin ???????? =====
  it('2. super_admin ??????????? 200', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // ===== ?? 3: ?????? passwordHash =====
  it('3. ?????? passwordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).not.toHaveProperty('passwordHash')
  })

  // ===== ?? 4: ?????? paymentPasswordHash =====
  it('4. ?????? paymentPasswordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).not.toHaveProperty('paymentPasswordHash')
  })

  // ===== ?? 5: hasPaymentPassword ???? ? true =====
  it('5. DB ??? paymentPasswordHash ??hasPaymentPassword ? true', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({
      user: { ...FULL_USER, paymentPasswordHash: 'some_hash' } as any,
      orderStats: ORDER_STATS as any,
    })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data.hasPaymentPassword).toBe(true)
    expect(data.data).not.toHaveProperty('paymentPasswordHash')
  })

  // ===== ?? 6: hasPaymentPassword ???? ? false =====
  it('6. DB ?? paymentPasswordHash ????hasPaymentPassword ? false', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({
      user: { ...FULL_USER, paymentPasswordHash: null } as any,
      orderStats: ORDER_STATS as any,
    })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data.hasPaymentPassword).toBe(false)
    expect(data.data).not.toHaveProperty('paymentPasswordHash')
  })

  // ===== ?? 7: ??????? passwordHash =====
  it('7. ?? JSON ????? passwordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()
    const dataStr = JSON.stringify(data.data)

    expect(dataStr).not.toContain('passwordHash')
  })

  // ===== ?? 8: ??????? paymentPasswordHash =====
  it('8. ?? JSON ????? paymentPasswordHash', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()
    const dataStr = JSON.stringify(data.data)

    expect(dataStr).not.toContain('paymentPasswordHash')
  })

  // ===== ?? 9: ????????? =====
  it('9. ??????????id/phone/nickname/level/balance/earningsAvailable/status?', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

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

  // ===== ?? 10: ????????? =====
  it('10. ??????????referrer/parent/referrals/children?', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).toHaveProperty('referrer')
    expect(data.data).toHaveProperty('parent')
    expect(data.data).toHaveProperty('referrals')
    expect(data.data).toHaveProperty('children')
  })

  // ===== ?? 11: ????????? =====
  it('11. ??????????orderCount/totalOrderAmount?', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: FULL_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.data).toHaveProperty('orderCount')
    expect(data.data).toHaveProperty('totalOrderAmount')
    expect(data.data.orderCount).toBe(5)
    expect(data.data.totalOrderAmount).toBe(2500)
  })

  // ===== ?? 12: ??????? 404 =====
  it('12. ??????? 404', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: null as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== ?? 13: ????? deleted ?? 404 =====
  it('13. ????? deleted ?? 404', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockResolvedValue({ user: DELETED_USER as any, orderStats: ORDER_STATS as any })

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== ?? 14: ????????? 500 =====
  it('14. ????????? 500', async () => {
    verifyPermission.mockResolvedValue({ user: SUPER_ADMIN, error: null })
    vi.mocked(UserService.getUserDetail).mockRejectedValue(new Error('???????'))

    const { GET } = await import('@/app/api/admin/users/[id]/route')
    const res = await GET(makeRequest() as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  // ===== ?? 15: PUT ????????? support_admin + super_admin =====
  it('15. PUT ????????? support_admin + super_admin', async () => {
    const module = await import('@/app/api/admin/users/[id]/route')
    expect(typeof module.PUT).toBe('function')

    verifyPermission.mockResolvedValue({ user: SUPPORT_ADMIN, error: null })
    vi.mocked(UserService.getUserById).mockResolvedValue({ id: 'u1', status: 'active', level: 1 } as any)
    vi.mocked(UserService.updateUserLevel).mockResolvedValue({} as any)

    const putReq = new Request('http://localhost/api/admin/users/u1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 2 }),
    })

    await module.PUT(putReq as any, { params: Promise.resolve({ id: 'u1' }) })

    const permCall = (verifyPermission as any).mock.calls[0]
    expect(permCall[1]).toEqual(['support_admin', 'super_admin'])
  })
})
