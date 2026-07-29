import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * v-A: 列表补全 referrer 关联 + directReferralCount
 * 任务 A 验收测试：getUsersList 必须返回 referrer 关系 + 直推人数
 */

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })

  const mockPrisma: any = {
    user: createMockChain(),
    order: createMockChain(),
    orderItem: createMockChain(),
    pointsRecord: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/services/points.service', () => ({
  PointsService: {
    createPointsRecord: vi.fn(),
    createPointsUnlockSchedule: vi.fn().mockResolvedValue({ id: 'sched-1' }),
  },
}))

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (_key: string, defaultValue: any) => defaultValue),
  invalidateBusinessConfigCache: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { UserService } from '@/lib/services/user.service'

describe('UserService.getUsersList — A 级: referrer 关联 + directReferralCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  it('应返回 referrer 关系(id/phone/nickname) 与 directReferralCount', async () => {
    // Arrange: 模拟 2 个用户，一个有推荐人 + 有 3 个直推
    const mockUsers = [
      {
        id: 'user-1',
        phone: '13800138001',
        nickname: 'alice',
        email: null,
        level: 2,
        status: 'active',
        role: 'user',
        balance: 100,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        frozenBalance: 0,
        consumeBalance: 0,
        earningsPending: 0,
        earningsAvailable: 0,
        earningsFrozen: 0,
        earningsVoided: 0,
        totalPoints: 0,
        unlockedPoints: 0,
        lockedPoints: 0,
        parentId: 'referrer-1',
        position: 1,
        upgradeProductCount: 0,
        directSalesAmount: 0,
        directDistributorCount: 0,
        paymentPasswordHash: 'hash-1',
        referrer: { id: 'referrer-1', phone: '13900139001', nickname: 'bob' },
        _count: { referrals: 3 },
      },
      {
        id: 'user-2',
        phone: '13800138002',
        nickname: 'charlie',
        email: 'charlie@test.com',
        level: 1,
        status: 'active',
        role: 'user',
        balance: 0,
        createdAt: new Date('2026-01-03'),
        updatedAt: new Date('2026-01-03'),
        frozenBalance: 0,
        consumeBalance: 0,
        earningsPending: 0,
        earningsAvailable: 0,
        earningsFrozen: 0,
        earningsVoided: 0,
        totalPoints: 0,
        unlockedPoints: 0,
        lockedPoints: 0,
        parentId: null,
        position: null,
        upgradeProductCount: 0,
        directSalesAmount: 0,
        directDistributorCount: 0,
        paymentPasswordHash: null,
        referrer: null,
        _count: { referrals: 0 },
      },
    ]
    prisma.user.findMany.mockResolvedValueOnce(mockUsers)
    prisma.user.count.mockResolvedValueOnce(2)

    // Act
    const result = await UserService.getUsersList({ page: 1, pageSize: 20 })

    // Assert: 调用 findMany 时 select 包含 referrer + _count.referrals
    const findManyCall = prisma.user.findMany.mock.calls[0][0]
    expect(findManyCall.select).toHaveProperty('referrer')
    expect(findManyCall.select.referrer).toEqual({
      select: { id: true, phone: true, nickname: true },
    })
    expect(findManyCall.select).toHaveProperty('_count')
    expect(findManyCall.select._count).toEqual({ select: { referrals: true } })
    // 不再选 referrerId
    expect(findManyCall.select).not.toHaveProperty('referrerId')

    // 输出包含 referrer 关系
    expect(result.users[0].referrer).toEqual({
      id: 'referrer-1',
      phone: '13900139001',
      nickname: 'bob',
    })
    expect(result.users[0].directReferralCount).toBe(3)
    expect(result.users[0].hasPaymentPassword).toBe(true)
    // 敏感字段 paymentPasswordHash 必须剔除
    expect(result.users[0]).not.toHaveProperty('paymentPasswordHash')
    expect(result.users[0]).not.toHaveProperty('_count')

    // 无推荐人用户：referrer=null, directReferralCount=0
    expect(result.users[1].referrer).toBeNull()
    expect(result.users[1].directReferralCount).toBe(0)
    expect(result.users[1].hasPaymentPassword).toBe(false)
  })

  it('应防御性处理 _count 缺失（向后兼容）', async () => {
    // Arrange: 老数据 / 其它路径可能没有 _count
    const mockUsers = [
      {
        id: 'user-3',
        phone: '13800138003',
        nickname: 'dave',
        email: null,
        level: 1,
        status: 'active',
        role: 'user',
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        frozenBalance: 0,
        consumeBalance: 0,
        earningsPending: 0,
        earningsAvailable: 0,
        earningsFrozen: 0,
        earningsVoided: 0,
        totalPoints: 0,
        unlockedPoints: 0,
        lockedPoints: 0,
        parentId: null,
        position: null,
        upgradeProductCount: 0,
        directSalesAmount: 0,
        directDistributorCount: 0,
        paymentPasswordHash: null,
        referrer: null,
        // _count 故意缺失
      },
    ]
    prisma.user.findMany.mockResolvedValueOnce(mockUsers)
    prisma.user.count.mockResolvedValueOnce(1)

    // Act
    const result = await UserService.getUsersList({ page: 1, pageSize: 20 })

    // Assert: 不抛错 + 默认 0
    expect(result.users[0].directReferralCount).toBe(0)
    expect(result.users[0].hasPaymentPassword).toBe(false)
  })
})
