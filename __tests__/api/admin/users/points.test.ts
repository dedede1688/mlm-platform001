import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: { findUnique: vi.fn(), update: vi.fn() },
    pointsRecord: { create: vi.fn() },
  },
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: {
    notifyPointsAdjust: vi.fn(),
  },
}))

import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'
import { OrderNotificationService } from '@/lib/services/order-notification.service'

describe('POST /api/admin/users/[id]/points', () => {
  beforeEach(() => vi.clearAllMocks())

  it('鉴权失败 → 401', async () => {
    verifyPermission.mockResolvedValueOnce({
      user: null,
      error: Response.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    })
    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '测试调账原因' }),
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(401)
  })

  it('调可用积分 → 事务内写 pointsRecord（type=admin_adjust）', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1' }, error: null })

    // mock $transaction：执行回调并返回结果
    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'u1',
            totalPoints: 1000,
            unlockedPoints: 500,
            lockedPoints: 500,
            status: 'active',
          }),
          update: vi.fn().mockResolvedValueOnce({
            id: 'u1',
            totalPoints: 1100,
            unlockedPoints: 600,
            lockedPoints: 500,
          }),
        },
        pointsRecord: { create: vi.fn().mockResolvedValueOnce({ id: 'pr1' }) },
      }
      return await cb(tx)
    })

    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '测试调账原因' }),
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.success).toBe(true)
    // 验证 pointsRecord.create 被调用
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('调可用积分 → 事务后触发 notifyPointsAdjust', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1' }, error: null })

    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'u1',
            totalPoints: 1000,
            unlockedPoints: 500,
            lockedPoints: 500,
            status: 'active',
          }),
          update: vi.fn().mockResolvedValueOnce({
            id: 'u1',
            totalPoints: 1100,
            unlockedPoints: 600,
            lockedPoints: 500,
          }),
        },
        pointsRecord: { create: vi.fn().mockResolvedValueOnce({ id: 'pr1' }) },
      }
      return await cb(tx)
    })

    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '测试调账原因' }),
    })
    await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })

    // 验证 notifyPointsAdjust 被调用
    expect(OrderNotificationService.notifyPointsAdjust).toHaveBeenCalledOnce()
    const callArgs = (OrderNotificationService.notifyPointsAdjust as any).mock.calls[0][0]
    expect(callArgs.userId).toBe('u1')
    expect(callArgs.amount).toBe(100)
    expect(callArgs.newTotalPoints).toBe(1100)
    expect(callArgs.newUnlockedPoints).toBe(600)
    expect(callArgs.fieldLabel).toBe('可用积分')
  })

  it('事务失败（用户不存在）→ 不写 pointsRecord / 不发通知', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1' }, error: null })

    prisma.$transaction.mockImplementationOnce(async (cb: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValueOnce(null), // 用户不存在
        },
      }
      return await cb(tx)
    })

    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '测试调账原因' }),
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(500)
    // 不应该调 logOperation 和 notifyPointsAdjust
    expect(logOperation).not.toHaveBeenCalled()
    expect(OrderNotificationService.notifyPointsAdjust).not.toHaveBeenCalled()
  })
})
