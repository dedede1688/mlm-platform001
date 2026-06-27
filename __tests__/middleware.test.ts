import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

// 在 import middleware 前设置 JWT_SECRET
process.env.JWT_SECRET = 'test-secret-for-middleware-v552'

// ---- Mock next/server ----

vi.mock('next/server', () => {
  return {
    NextRequest: class MockNextRequest {
      // 仅用于类型兼容，实际测试中用 mock 对象
    },
    NextResponse: {
      json: vi.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
        status: init?.status ?? 200,
        body,
        headers: new Headers(init?.headers),
      })),
      next: vi.fn((options?: { request?: { headers: Headers } }) => ({
        status: 200,
        request: options?.request,
      })),
    },
  }
})

// ---- 导入被测模块 ----

import { middleware } from '@/middleware'

// ---- 辅助函数 ----

function createMockRequest(pathname: string, authHeader?: string) {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  return {
    nextUrl: { pathname },
    headers,
  } as never
}

function createToken(payload: object, options?: jwt.SignOptions): string {
  return jwt.sign(payload, 'test-secret-for-middleware-v552', options)
}

// ---- 测试 ----

describe('v55.2: middleware JWT 签名验证', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('非 admin 路径直接放行（不检查 token）', () => {
    const req = createMockRequest('/api/products')
    const res = middleware(req)
    expect(res.status).toBe(200)
  })

  it('无 Authorization header 返回 401', () => {
    const req = createMockRequest('/api/admin/users')
    const res = middleware(req) as { status: number; body: { success: boolean; error: string } }
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('未提供认证令牌')
  })

  it('Authorization header 不带 Bearer 前缀返回 401', () => {
    const req = createMockRequest('/api/admin/users', 'token-without-bearer')
    const res = middleware(req) as { status: number }
    expect(res.status).toBe(401)
  })

  it('伪造 token（假签名）返回 401（v55.2 签名验证）', () => {
    // 构造伪造 token：header.payload.signature 都是假的
    const fakePayload = Buffer.from(
      JSON.stringify({ userId: 'admin', role: 'super_admin' })
    ).toString('base64url')
    const fakeToken = `fakeheader.${fakePayload}.fakesignature`
    const req = createMockRequest('/api/admin/users', `Bearer ${fakeToken}`)
    const res = middleware(req) as { status: number; body: { success: boolean; error: string } }
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('认证令牌无效或已过期')
  })

  it('过期 token 返回 401', () => {
    const expiredToken = createToken(
      { userId: 'u1', phone: '138', role: 'super_admin' },
      { expiresIn: '-1s' }
    )
    const req = createMockRequest('/api/admin/users', `Bearer ${expiredToken}`)
    const res = middleware(req) as { status: number }
    expect(res.status).toBe(401)
  })

  it('有效 token + 正确角色放行并注入 x-user-id/x-user-role', () => {
    const token = createToken({ userId: 'u-admin', phone: '138', role: 'super_admin' })
    const req = createMockRequest('/api/admin/users', `Bearer ${token}`)
    const res = middleware(req) as { status: number; request: { headers: Headers } }
    expect(res.status).toBe(200)
    expect(res.request.headers.get('x-user-id')).toBe('u-admin')
    expect(res.request.headers.get('x-user-role')).toBe('super_admin')
  })

  it('有效 token + 错误角色返回 403', () => {
    // /api/admin/users 要求 ['super_admin', 'support_admin']
    // goods_admin 不在白名单中
    const token = createToken({ userId: 'u1', phone: '138', role: 'goods_admin' })
    const req = createMockRequest('/api/admin/users', `Bearer ${token}`)
    const res = middleware(req) as { status: number; body: { success: boolean; error: string } }
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('无权访问该接口')
  })

  it('有效 token + 路径不在 pathRoleMap 中仍放行（路由内自行鉴权）', () => {
    // /api/admin/config 不在 pathRoleMap 中
    const token = createToken({ userId: 'u1', phone: '138', role: 'super_admin' })
    const req = createMockRequest('/api/admin/config', `Bearer ${token}`)
    const res = middleware(req) as { status: number }
    expect(res.status).toBe(200)
  })

  it('子路径正确匹配父级 pathRoleMap（如 /api/admin/users/123 → /api/admin/users）', () => {
    // /api/admin/users/123/status 应匹配 /api/admin/users
    const token = createToken({ userId: 'u1', phone: '138', role: 'support_admin' })
    const req = createMockRequest('/api/admin/users/u-123/status', `Bearer ${token}`)
    const res = middleware(req) as { status: number }
    expect(res.status).toBe(200)
  })

  it('子路径 + 错误角色返回 403', () => {
    // /api/admin/users/123 应匹配 /api/admin/users → 要求 super_admin/support_admin
    const token = createToken({ userId: 'u1', phone: '138', role: 'finance_admin' })
    const req = createMockRequest('/api/admin/users/u-123', `Bearer ${token}`)
    const res = middleware(req) as { status: number }
    expect(res.status).toBe(403)
  })

  it('traceId 注入到 401/403 响应头', () => {
    const req = createMockRequest('/api/admin/users')
    const res = middleware(req) as { headers: Headers }
    expect(res.headers.get('x-trace-id')).toBeTruthy()
  })

  it('traceId 注入到放行请求头', () => {
    const token = createToken({ userId: 'u1', phone: '138', role: 'super_admin' })
    const req = createMockRequest('/api/admin/users', `Bearer ${token}`)
    const res = middleware(req) as { request: { headers: Headers } }
    expect(res.request.headers.get('x-trace-id')).toBeTruthy()
  })
})
