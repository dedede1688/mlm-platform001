import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    pointsRecord: createMockChain(),
    $transaction: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/services/points.service', () => ({
  PointsService: {
    createPointsRecord: vi.fn(),
  },
}))

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (_key: string, defaultValue: any) => defaultValue),
  invalidateBusinessConfigCache: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { PointsService } from '@/lib/services/points.service'
import { UserService } from '@/lib/services/user.service'

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('createUser', () => {
    it('should create user without referrer', async () => {
      const mockUser = { id: 'u1', phone: '13800138001', level: 1 }
      prisma.user.create.mockResolvedValueOnce(mockUser)

      const result = await UserService.createUser({
        phone: '13800138001',
        passwordHash: 'hashed',
        nickname: 'test',
      })

      expect(result).toEqual(mockUser)
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '13800138001',
          passwordHash: 'hashed',
          nickname: 'test',
          level: 1,
        }),
      })
    })

    it('should create user with referrer and find placement', async () => {
      prisma.user.findMany.mockResolvedValueOnce([])
      const mockUser = { id: 'u2', parentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', position: 1 }
      prisma.user.create.mockResolvedValueOnce(mockUser)

      const result = await UserService.createUser({
        phone: '13800138002',
        passwordHash: 'hashed',
        referrerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })

      expect(result).toEqual(mockUser)
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          referrerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          parentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          position: 1,
        }),
      })
    })

    it('should auto-generate nickname when not provided', async () => {
      prisma.user.findMany.mockResolvedValueOnce([])
      prisma.user.create.mockResolvedValueOnce({ id: 'u3' })

      await UserService.createUser({
        phone: '13800138001',
        passwordHash: 'hashed',
        referrerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nickname: '用户8001',
        }),
      })
    })
  })

  describe('findPlacementPosition', () => {
    it('should throw error for invalid uuid format', async () => {
      await expect(UserService.findPlacementPosition('invalid-id'))
        .rejects.toThrow('推荐人 ID 格式无效')
    })

    it('should return referrer as parent when no children exist', async () => {
      prisma.user.findMany.mockResolvedValueOnce([])

      const result = await UserService.findPlacementPosition('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

      expect(result).toEqual({ parentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', position: 1 })
    })

    it('should find next available position via BFS', async () => {
      const referrerId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      prisma.user.findMany.mockResolvedValueOnce([
        { id: referrerId, parentId: null, position: null },
        { id: 'child-1', parentId: referrerId, position: 1 },
      ])

      const result = await UserService.findPlacementPosition(referrerId)

      expect(result).toEqual({ parentId: referrerId, position: 2 })
    })
  })

  describe('getPlacementChain', () => {
    it('should return empty array for user with no parent', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ parentId: null })

      const result = await UserService.getPlacementChain('u1')

      expect(result).toEqual([])
    })

    it('should return chain of parents up to maxDepth', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ parentId: 'u2' })
        .mockResolvedValueOnce({ parentId: 'u3' })
        .mockResolvedValueOnce({ parentId: null })

      const result = await UserService.getPlacementChain('u1', 5)

      expect(result).toEqual(['u2', 'u3'])
    })
  })

  describe('checkAndUpgradeLevel', () => {
    it('should do nothing for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null)

      await UserService.checkAndUpgradeLevel('nonexistent')

      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('should upgrade to DISTRIBUTOR when upgradeProductCount >= box_count', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', level: 1, upgradeProductCount: 10, directSalesAmount: 0, referrerId: 'ref-1',
      })
      prisma.user.update.mockResolvedValueOnce({})
      vi.mocked(PointsService.createPointsRecord).mockResolvedValueOnce({} as any)
      prisma.user.update.mockResolvedValueOnce({})

      await UserService.checkAndUpgradeLevel('u1')

      expect(prisma.user.update).toHaveBeenCalled()
    })

    it('should upgrade to higher level when directSalesAmount meets requirement', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u2', level: 2, upgradeProductCount: 5, directSalesAmount: 100000, referrerId: 'ref-1',
      })
      prisma.user.update.mockResolvedValueOnce({})

      await UserService.checkAndUpgradeLevel('u2')

      expect(prisma.user.update).toHaveBeenCalled()
    })

    it('should not upgrade when conditions not met', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u3', level: 1, upgradeProductCount: 0, directSalesAmount: 0, referrerId: null,
      })

      const { getBusinessConfig } = await import('@/lib/config/business')
      vi.mocked(getBusinessConfig).mockImplementation(async (key: string, _defaultValue: any) => {
        if (key.startsWith('upgrade.') && key.endsWith('.sales_amount')) return 999999
        if (key === 'upgrade.distributor.box_count') return 999
        if (key === 'upgrade.points_per_box') return 500
        return _defaultValue
      })

      const result = await UserService.checkAndUpgradeLevel('u3')

      expect(result).toBe(1)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  })

  describe('getReferrals', () => {
    it('should return list of users referred by userId', async () => {
      const mockReferrals = [{ id: 'r1', phone: '111' }, { id: 'r2', phone: '222' }]
      prisma.user.findMany.mockResolvedValueOnce(mockReferrals)

      const result = await UserService.getReferrals('u1')

      expect(result).toEqual(mockReferrals)
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { referrerId: 'u1' },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('getTeam', () => {
    it('should return empty array for user with no children', async () => {
      prisma.user.findMany.mockResolvedValueOnce([])

      const result = await UserService.getTeam('u1')

      expect(result).toEqual([])
    })

    it('should return team members with depth', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'child-1', level: 1 },
          { id: 'child-2', level: 1 },
        ])
        .mockResolvedValueOnce([
          { id: 'grand-1', level: 1 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await UserService.getTeam('u1', 5)

      expect(result).toContainEqual({ id: 'child-1', level: 1, depth: 1 })
      expect(result).toContainEqual({ id: 'child-2', level: 1, depth: 1 })
      expect(result).toContainEqual({ id: 'grand-1', level: 1, depth: 2 })
    })
  })

  describe('addDirectSales', () => {
    it('should increment directSalesAmount', async () => {
      prisma.user.update.mockResolvedValueOnce({})

      await UserService.addDirectSales('u1', 500)

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { directSalesAmount: { increment: 500 } },
      })
    })
  })

  describe('addUpgradeProductCount', () => {
    it('should increment upgradeProductCount by 1 by default', async () => {
      prisma.user.update.mockResolvedValueOnce({})

      await UserService.addUpgradeProductCount('u1')

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { upgradeProductCount: { increment: 1 } },
      })
    })

    it('should increment upgradeProductCount by custom count', async () => {
      prisma.user.update.mockResolvedValueOnce({})

      await UserService.addUpgradeProductCount('u1', 5)

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { upgradeProductCount: { increment: 5 } },
      })
    })
  })
})