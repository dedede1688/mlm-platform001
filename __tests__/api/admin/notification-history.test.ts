import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  })
  return { prisma: { notificationBatch: createMockChain(), notification: createMockChain() } }
})

import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

describe('GET /api/admin/notification-history', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return 401 if not authorized', async () => {
    verifyPermission.mockResolvedValueOnce({ user: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) })
    const { GET } = await import('@/app/api/admin/notification-history/route')
    const req = new Request('http://localhost/api/admin/notification-history')
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })

  it('should return batches with readCount', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1', role: 'admin' }, error: null })
    prisma.notificationBatch.findMany.mockResolvedValueOnce([
      { id: 'b1', type: 'business', title: '测试', content: '内容', senderId: null, recipientCount: 2, readCount: 0, status: 'sent', templateType: null, createdAt: new Date().toISOString(), sender: null },
    ])
    prisma.notificationBatch.count.mockResolvedValueOnce(1)
    prisma.notification.count.mockResolvedValueOnce(1)

    const { GET } = await import('@/app/api/admin/notification-history/route')
    const req = new Request('http://localhost/api/admin/notification-history')
    const res = await GET(req as any)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.batches[0].readCount).toBe(1)
    expect(data.data.pagination.total).toBe(1)
  })

  it('should filter by type', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1', role: 'admin' }, error: null })
    prisma.notificationBatch.findMany.mockResolvedValueOnce([])
    prisma.notificationBatch.count.mockResolvedValueOnce(0)

    const { GET } = await import('@/app/api/admin/notification-history/route')
    const req = new Request('http://localhost/api/admin/notification-history?type=announcement')
    const res = await GET(req as any)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(prisma.notificationBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: 'announcement' } })
    )
  })
})

describe('GET /api/admin/notification-history/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return 404 if batch not found', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1', role: 'admin' }, error: null })
    prisma.notificationBatch.findUnique.mockResolvedValueOnce(null)

    const { GET } = await import('@/app/api/admin/notification-history/[id]/route')
    const req = new Request('http://localhost/api/admin/notification-history/b1')
    const res = await GET(req as any, { params: Promise.resolve({ id: 'b1' }) })
    expect(res.status).toBe(404)
  })

  it('should return batch detail with readCount', async () => {
    verifyPermission.mockResolvedValueOnce({ user: { id: 'admin1', role: 'admin' }, error: null })
    prisma.notificationBatch.findUnique.mockResolvedValueOnce({
      id: 'b1', type: 'general', title: '测试', content: '内容', senderId: null, recipientCount: 2, readCount: 0, status: 'sent', templateType: null, createdAt: new Date().toISOString(), sender: null,
      notifications: [
        { id: 'n1', userId: 'u1', isRead: true, createdAt: new Date().toISOString(), user: { id: 'u1', nickname: '张三', phone: '13800000001' } },
        { id: 'n2', userId: 'u2', isRead: false, createdAt: new Date().toISOString(), user: { id: 'u2', nickname: '李四', phone: '13800000002' } },
      ],
    })

    const { GET } = await import('@/app/api/admin/notification-history/[id]/route')
    const req = new Request('http://localhost/api/admin/notification-history/b1')
    const res = await GET(req as any, { params: Promise.resolve({ id: 'b1' }) })
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.readCount).toBe(1)
    expect(data.data.recipientCount).toBe(2)
  })
})