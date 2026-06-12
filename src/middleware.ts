import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

// ---- 路径与所需角色映射 ----

const pathRoleMap: Record<string, string[]> = {
  '/api/admin/orders': ['super_admin', 'goods_admin', 'support_admin'],
  '/api/admin/products': ['super_admin', 'goods_admin'],
  '/api/admin/categories': ['super_admin', 'goods_admin'],
  '/api/admin/banners': ['super_admin', 'goods_admin'],
  '/api/admin/users': ['super_admin', 'support_admin'],
  '/api/admin/finance': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/settings': ['super_admin'],
  '/api/admin/refunds': ['super_admin', 'finance_admin'],
  '/api/admin/withdrawals': ['super_admin', 'finance_admin'],
  '/api/admin/settle-dividends': ['super_admin', 'finance_admin'],
  '/api/admin/manual-reward': ['super_admin', 'finance_admin'],
  '/api/admin/rewards': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/statistics': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/stats': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/logs': ['super_admin', 'auditor'],
  '/api/admin/notifications': ['super_admin', 'support_admin'],
}

// ---- 辅助函数 ----

function verifyJwt(token: string): { userId: string; phone: string; role?: string } | null {
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      console.error('JWT_SECRET environment variable is not set')
      return null
    }
    return jwt.verify(token, secret) as { userId: string; phone: string; role?: string }
  } catch {
    return null
  }
}

/**
 * 匹配路径：将 /api/admin/orders/123 匹配到 /api/admin/orders
 */
function matchPath(pathname: string): string | null {
  // 精确匹配
  if (pathRoleMap[pathname]) return pathname
  // 前缀匹配（处理子路径如 /api/admin/orders/xxx）
  const sorted = Object.keys(pathRoleMap).sort((a, b) => b.length - a.length)
  for (const prefix of sorted) {
    if (pathname.startsWith(prefix + '/') || pathname === prefix) {
      return prefix
    }
  }
  return null
}

// ---- Middleware 主逻辑 ----

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const traceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // 仅拦截 /api/admin/* 路径
  if (!pathname.startsWith('/api/admin/')) {
    return NextResponse.next()
  }

  // 提取 token
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: '未提供认证令牌' },
      { status: 401, headers: { 'x-trace-id': traceId } }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  const decoded = verifyJwt(token)
  if (!decoded) {
    return NextResponse.json(
      { success: false, error: '认证令牌无效或已过期' },
      { status: 401, headers: { 'x-trace-id': traceId } }
    )
  }

  // 匹配路径角色
  const matchedPath = matchPath(pathname)
  if (!matchedPath) {
    // 未在映射中的 admin API，允许通过（后续由各路由自行校验）
    return NextResponse.next()
  }

  const requiredRoles = pathRoleMap[matchedPath]
  const userRole = decoded.role || ''

  if (!requiredRoles.includes(userRole)) {
    return NextResponse.json(
      { success: false, error: '无权访问该接口' },
      { status: 403, headers: { 'x-trace-id': traceId } }
    )
  }

  // 将用户信息注入请求头，供后续路由使用
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', decoded.userId)
  requestHeaders.set('x-user-role', userRole)
  requestHeaders.set('x-trace-id', traceId)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

// ---- 匹配器配置 ----

export const config = {
  matcher: '/api/admin/:path*',
}