import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/utils/auth', () => ({
  verifyToken: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetIn: 60000 })),
  getClientIP: vi.fn(() => '127.0.0.1'),
  rateLimitResponse: vi.fn((message: string, resetInMs: number) =>
    new Response(JSON.stringify({ success: false, error: message }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(resetInMs / 1000)) },
    })
  ),
}))

import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIP } from '@/lib/utils/rate-limit'

describe('GET /api/users/lookup — 隐私保护', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).__rateLimitBuckets?.clear()
    checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetIn: 60000 })
  })

  it('无 token → 401', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })

  it('手机号格式错误 → 400', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=123')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('同 IP 第 11 次请求 → 429', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ userId: 'u1', phone: '13900139000' })
    checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetIn: 60000 })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u2', phone: '13800138000', nickname: '张三', referrerId: 'u1',
    })

    const { GET } = await import('@/app/api/users/lookup/route')
    for (let i = 0; i < 10; i++) {
      const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
      await GET(req as any)
    }

    checkRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 30000 })
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(429)
  })

  it('查自己 → 200', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', phone: '13900139000', nickname: '我', referrerId: null,
    })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13900139000')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data.id).toBe('u1')
  })

  it('查直推下线（target.referrerId = 我）→ 200', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u2', phone: '13800138000', nickname: '直推', referrerId: 'u1',
    })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data.id).toBe('u2')
  })

  it('查推荐链上线（第 2 层 referrerId 命中）→ 200', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u3', phone: '13700137000' })
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: 'u1', phone: '13900139000', nickname: '上线', referrerId: null,
      })
      .mockResolvedValueOnce({ referrerId: 'u2' })
      .mockResolvedValueOnce({ referrerId: 'u1' })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13900139000')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
  })

  it('查安置链上线（parentId 命中）→ 200', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u3', phone: '13700137000' })
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: 'u1', phone: '13900139000', nickname: '安置上线', referrerId: null,
      })
      .mockResolvedValueOnce({ referrerId: null })
      .mockResolvedValueOnce({ parentId: 'u1' })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13900139000')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
  })

  it('非团队用户 → 404 且 error 为「用户不存在」', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: 'u-stranger', phone: '13800138000', nickname: '陌生人', referrerId: 'u-other',
      })
      .mockResolvedValueOnce({ referrerId: null })
      .mockResolvedValueOnce({ parentId: null })
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('用户不存在')
  })

  it('真实不存在 → 404 且文案与非团队用户完全相同', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ userId: 'u1', phone: '13900139000' })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/users/lookup/route')
    const req = new Request('http://localhost/api/users/lookup?phone=13800138000')
    const res = await GET(req as any)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('用户不存在')
  })
})