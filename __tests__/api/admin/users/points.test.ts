import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyPermission: vi.fn(),
  adminAdjustPoints: vi.fn(),
  logOperation: vi.fn(),
  notifyPointsAdjust: vi.fn(),
}))

vi.mock('@/lib/utils/admin-auth', () => ({ verifyPermission: mocks.verifyPermission }))
vi.mock('@/lib/services/points.service', () => ({
  PointsService: { adminAdjustPoints: mocks.adminAdjustPoints },
}))
vi.mock('@/lib/utils/operation-log', () => ({ logOperation: mocks.logOperation }))
vi.mock('@/lib/services/order-notification.service', () => ({
  OrderNotificationService: { notifyPointsAdjust: mocks.notifyPointsAdjust },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

describe('POST /api/admin/users/[id]/points', () => {
  beforeEach(() => vi.clearAllMocks())

  const mockResult = {
    fieldLabel: '\u53ef\u7528\u79ef\u5206',
    oldValue: { totalPoints: 1000, unlockedPoints: 500, lockedPoints: 500 },
    updated: { totalPoints: 1100, unlockedPoints: 600, lockedPoints: 500 },
  }

  it('鉴权失败 \u2192 401', async () => {
    mocks.verifyPermission.mockResolvedValueOnce({
      user: null,
      error: Response.json({ success: false, message: 'Unauthorized' }, { status: 401 }),
    })
    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '\u6d4b\u8bd5\u8c03\u8d26\u539f\u56e0' }),
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })
    expect(res.status).toBe(401)
  })

  it('\u8c03\u53ef\u7528\u79ef\u5206 \u2192 \u8c03\u7528 PointsService.adminAdjustPoints', async () => {
    mocks.verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1' }, error: null })
    mocks.adminAdjustPoints.mockResolvedValueOnce(mockResult)

    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '\u6d4b\u8bd5\u8c03\u8d26\u539f\u56e0' }),
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(mocks.adminAdjustPoints).toHaveBeenCalledOnce()
    expect(mocks.adminAdjustPoints).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', type: 'unlockedPoints', amount: 100,
    }))
  })

  it('\u8c03\u53ef\u7528\u79ef\u5206 \u2192 \u4e8b\u52a1\u540e\u89e6\u53d1 notifyPointsAdjust', async () => {
    mocks.verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1' }, error: null })
    mocks.adminAdjustPoints.mockResolvedValueOnce(mockResult)

    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '\u6d4b\u8bd5\u8c03\u8d26\u539f\u56e0' }),
    })
    await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(mocks.notifyPointsAdjust).toHaveBeenCalledOnce()
    const callArgs = (mocks.notifyPointsAdjust as any).mock.calls[0][0]
    expect(callArgs.userId).toBe('u1')
    expect(callArgs.amount).toBe(100)
    expect(callArgs.newTotalPoints).toBe(1100)
    expect(callArgs.newUnlockedPoints).toBe(600)
  })

  it('\u4e8b\u52a1\u5931\u8d25\uff08\u7528\u6237\u4e0d\u5b58\u5728\uff09\u2192 \u4e0d\u5199 pointsRecord / \u4e0d\u53d1\u901a\u77e5', async () => {
    mocks.verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1' }, error: null })
    mocks.adminAdjustPoints.mockRejectedValueOnce(new Error('\u7528\u6237\u4e0d\u5b58\u5728'))

    const { POST } = await import('@/app/api/admin/users/[id]/points/route')
    const req = new Request('http://localhost/api/admin/users/u1/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unlockedPoints', amount: 100, reason: '\u6d4b\u8bd5\u8c03\u8d26\u539f\u56e0' }),
    })
    const res = await POST(req as any, { params: Promise.resolve({ id: 'u1' }) })

    expect(res.status).toBe(500)
    expect(mocks.logOperation).not.toHaveBeenCalled()
    expect(mocks.notifyPointsAdjust).not.toHaveBeenCalled()
  })
})
