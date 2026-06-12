import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })
  
  const mockPrisma: any = {
    user: createMockChain(),
    pointsRecord: createMockChain(),
    pointsUnlockSchedule: createMockChain(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

import { prisma } from '@/lib/prisma'
import { PointsService } from '@/lib/services/points.service'

describe('PointsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  describe('transferPoints', () => {
    it('should transfer points successfully', async () => {
      // Mock atomic deduction success
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }]) // fromUser deduction
        .mockResolvedValueOnce([{ count: 1 }]) // toUser addition

      prisma.user.findUnique
        .mockResolvedValueOnce({ // fromUser
          id: 'u1',
          nickname: 'User1',
          phone: '13800000001',
          totalPoints: 1000,
          unlockedPoints: 500,
          lockedPoints: 500,
          level: 2,
        })
        .mockResolvedValueOnce({ // toUser
          id: 'u2',
          nickname: 'User2',
          phone: '13800000002',
          totalPoints: 200,
          unlockedPoints: 100,
          lockedPoints: 100,
          level: 1, // Member level >= 1
        })

      prisma.pointsRecord.create.mockResolvedValue({})

      const result = await PointsService.transferPoints('u1', 'u2', 100)
      expect(result).toBeDefined()
      expect(result.amount).toBe(100)
      expect(result.feeAmount).toBe(10) // 10% fee
      expect(result.totalDeduction).toBe(110)
    })

    it('should throw error with insufficient points', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]) // Deduction failed

      await expect(PointsService.transferPoints('u1', 'u2', 10000))
        .rejects.toThrow('可用积分不足')
    })

    it('should throw error with non-positive amount', async () => {
      await expect(PointsService.transferPoints('u1', 'u2', 0))
        .rejects.toThrow('转赠金额必须大于0')
    })

    it('should throw error when receiver level < 1', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ count: 1 }])

      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'u1',
          nickname: 'User1',
          totalPoints: 1000,
          unlockedPoints: 500,
          lockedPoints: 500,
          level: 2,
        })
        .mockResolvedValueOnce({
          id: 'u2',
          nickname: 'User2',
          totalPoints: 0,
          unlockedPoints: 0,
          lockedPoints: 0,
          level: 0, // Visitor level
        })

      await expect(PointsService.transferPoints('u1', 'u2', 100))
        .rejects.toThrow('接收用户必须是注册会员')
    })
  })
})
