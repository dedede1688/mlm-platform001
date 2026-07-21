import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock verifyToken
vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    systemConfig: {
      findUnique: vi.fn(),
    },
  },
}))

// Mock PointsService
vi.mock('@/lib/services/points.service', () => ({
  PointsService: {
    transferPoints: vi.fn(),
  },
}))

import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'
import { PointsService } from '@/lib/services/points.service'

// ============================================================
// GET /api/users/lookup
// ============================================================
describe('GET /api/users/lookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('未登录返回 401', async () => {
    verifyToken.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })

  it('手机号格式不正确返回 400', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=123')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('用户不存在返回 404', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    prisma.user.findUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(404)
  })

  it('查询成功返回用户基本信息', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      phone: '13800138000',
      nickname: '张三',
      referrerId: 'u1',
    })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.id).toBe('u2')
    expect(data.data.phone).toBe('13800138000')
    expect(data.data.nickname).toBe('张三')
  })
})

// ============================================================
// POST /api/points/transfer
// ============================================================
describe('POST /api/points/transfer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('未登录返回 401', async () => {
    verifyToken.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/points/transfer/route')
    const req = new Request('http://localhost/api/points/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserPhone: '13800138000', points: 100 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(401)
  })

  it('参数错误返回 400（toUserPhone 缺失）', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    const { POST } = await import('@/app/api/points/transfer/route')
    const req = new Request('http://localhost/api/points/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: 100 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('参数错误返回 400（points ≤ 0）', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    const { POST } = await import('@/app/api/points/transfer/route')
    const req = new Request('http://localhost/api/points/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserPhone: '13800138000', points: 0 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('接收用户不存在返回 404', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    prisma.user.findUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/points/transfer/route')
    const req = new Request('http://localhost/api/points/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserPhone: '13800138000', points: 100 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(404)
  })

  it('转赠成功返回手续费详情', async () => {
    verifyToken.mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      phone: '13800138000',
      nickname: '张三',
    })
    prisma.systemConfig.findUnique.mockResolvedValueOnce({ value: '10' })
    PointsService.transferPoints.mockResolvedValueOnce({
      fromUser: { id: 'u1', phone: '13900139000', nickname: '李四' },
      toUser: { id: 'u2', phone: '13800138000', nickname: '张三' },
      amount: 100,
      feeAmount: 10,
      totalDeduction: 110,
    })
    const { POST } = await import('@/app/api/points/transfer/route')
    const req = new Request('http://localhost/api/points/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserPhone: '13800138000', points: 100 }),
    })
    const res = await POST(req as any)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.amount).toBe(100)
    expect(data.data.feeAmount).toBe(10)
    expect(data.data.totalDeduction).toBe(110)
    expect(data.data.feePercent).toBe(10)
  })
})
