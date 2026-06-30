import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma（含 notificationBatch 给 notifyPointsUnlock 用）
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
    notificationBatch: createMockChain(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
  return { prisma: mockPrisma }
})

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/config/business', () => ({
  getBusinessConfig: vi.fn().mockImplementation(async (_key: string, defaultValue: any) => defaultValue),
  invalidateBusinessConfigCache: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// Mock sendInApp（notifyPointsUnlock 内部调用）
vi.mock('@/lib/notification/sendInApp', () => ({
  sendInApp: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { PointsService } from '@/lib/services/points.service'
import { sendInApp } from '@/lib/notification/sendInApp'

describe('PointsService.dailyUnlock 通知', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma))
  })

  it('dailyUnlock 触发后 sendInApp 被以 templateType=points_unlock 调用', async () => {
    // 1. mock findMany 返回 1 条 active schedule
    prisma.pointsUnlockSchedule.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        userId: 'u1',
        remainingPoints: 1000,
        dailyUnlockRate: 0.01,
        completedDays: 0,
        totalDays: 100,
      },
    ])

    // 2. mock getUserPoints → user.findUnique
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      totalPoints: 2000,
      unlockedPoints: 500,
      lockedPoints: 1500,
    })

    // 3. mock 事务内操作
    prisma.user.update.mockResolvedValueOnce({})
    prisma.pointsUnlockSchedule.update.mockResolvedValueOnce({})
    prisma.pointsRecord.create.mockResolvedValueOnce({})

    // 4. mock notifyPointsUnlock 内部的 notificationBatch.create
    prisma.notificationBatch.create.mockResolvedValueOnce({ id: 'b1' })

    // 5. 执行
    const count = await PointsService.dailyUnlock()

    // 6. 验证
    expect(count).toBe(1)
    expect(sendInApp).toHaveBeenCalledTimes(1)
    const callArgs = (sendInApp as any).mock.calls[0][0]
    expect(callArgs.templateType).toBe('points_unlock')
    expect(callArgs.userId).toBe('u1')
    expect(callArgs.variables.unlockAmount).toBe('10') // Math.floor(1000 * 0.01) = 10
  })

  it('通知失败（sendInApp 抛错）不影响 dailyUnlock 主流程', async () => {
    // 1. mock findMany 返回 1 条 active schedule
    prisma.pointsUnlockSchedule.findMany.mockResolvedValueOnce([
      {
        id: 's2',
        userId: 'u2',
        remainingPoints: 500,
        dailyUnlockRate: 0.02,
        completedDays: 5,
        totalDays: 50,
      },
    ])

    // 2. mock getUserPoints
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      totalPoints: 1000,
      unlockedPoints: 200,
      lockedPoints: 800,
    })

    // 3. mock 事务内操作
    prisma.user.update.mockResolvedValueOnce({})
    prisma.pointsUnlockSchedule.update.mockResolvedValueOnce({})
    prisma.pointsRecord.create.mockResolvedValueOnce({})

    // 4. mock notificationBatch.create 成功
    prisma.notificationBatch.create.mockResolvedValueOnce({ id: 'b2' })

    // 5. mock sendInApp 抛错
    ;(sendInApp as any).mockRejectedValueOnce(new Error('模板不存在'))

    // 6. 执行 — 不应该 throw
    const count = await PointsService.dailyUnlock()

    // 7. 验证 dailyUnlock 仍正常完成
    expect(count).toBe(1)
    // sendInApp 确实被调了（只是失败了）
    expect(sendInApp).toHaveBeenCalledTimes(1)
  })
})
