import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { logger } from '@/lib/logger'

// ---- 用户侧需要登录的路径（仅验证 JWT，不校验角色） ----
//
// 注意：/api/settings 已移除——当前 /api/settings/public 是公开接口。
// 未来新增 /api/settings/* 路径需手动评估是否加入 userProtectedPaths。
//
// 注意：/api/users 是 /api/users/{lookup,me,team} 的兜底前缀。
// 未来新增 /api/users/* 需评估是否应公开，避免被自动拦截。

const userProtectedPaths = [
  '/api/cart',
  '/api/dividends',
  '/api/notifications',
  '/api/orders',
  '/api/points',
  '/api/rewards',
  '/api/user',
  '/api/users',
  '/api/withdrawals',
  '/api/auth/me',
  '/api/auth/change-password',
]

// ---- admin 路径与所需角色映射 ----

const pathRoleMap: Record<string, string[]> = {
  '/api/admin/orders': ['super_admin', 'goods_admin'],
  '/api/admin/products': ['super_admin', 'goods_admin'],
  '/api/admin/categories': ['super_admin', 'goods_admin'],
  '/api/admin/banners': ['super_admin', 'goods_admin'],
  '/api/admin/users': ['super_admin', 'support_admin'],
  '/api/admin/finance': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/settings': ['super_admin'],
  '/api/admin/refunds': ['super_admin', 'finance_admin'],
  '/api/admin/withdrawals': ['super_admin', 'finance_admin'],
  '/api/admin/recharge': ['super_admin', 'finance_admin'],
  '/api/admin/recharge-settings': ['super_admin', 'finance_admin'],
  '/api/admin/settle-dividends': ['super_admin', 'finance_admin'],
  '/api/admin/manual-reward': ['super_admin', 'finance_admin'],
  '/api/admin/rewards': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/stats': ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'],
  '/api/admin/logs': ['super_admin', 'auditor'],
  '/api/admin/notifications': ['super_admin'],
  '/api/admin/notification-history': ['super_admin', 'support_admin'],
  '/api/admin/points': ['super_admin', 'points_admin'],
  '/api/admin/referral-tree': ['super_admin', 'support_admin'],
  '/api/admin/reports': ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'],
  '/api/admin/system-config': ['super_admin'],
  '/api/admin/withdrawal-templates': ['super_admin', 'finance_admin'],
}

// ---- 辅助函数 ----

/**
 * v55.2: 真正验证 JWT 签名（之前 v51.3 e1c5153 因 Edge Runtime 环境变量不一致导致 401 而不验证）
 * 现在 runtime='nodejs'（line 138），JWT_SECRET 可读，恢复签名验证。
 * 验证失败返回 null，由调用方决定返回 401。
 */
function verifyJwtPayload(token: string): { userId?: string; phone?: string; role?: string } | null {
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      logger.error('[v55.2 middleware] JWT_SECRET 未配置')
      return null
    }
    const decoded = jwt.verify(token, secret) as { userId?: string; phone?: string; role?: string }
    return {
      userId: decoded.userId,
      phone: decoded.phone,
      role: decoded.role,
    }
  } catch {
    // 签名失败 / 过期 / 格式错误 → 返回 null，不抛错（避免 middleware crash）
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
//
// v55.2: runtime='nodejs' 已设置（line 138），JWT_SECRET 可读。
// middleware 现在真正验证 JWT 签名（jwt.verify），
// 配合各 API 路由内的 verifyPermission 形成双保险。
//
// 安全策略：
//   1. middleware 验证签名 + 角色检查（早期拦截）
//   2. API 路由 verifyPermission 再次验证签名 + 查库确认角色（最终防线）

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const traceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // ---- 分支 1：admin 路径 → 完整角色校验（原有逻辑） ----
  if (pathname.startsWith('/api/admin/')) {
    return adminAuth(request, traceId)
  }

  // ---- 分支 2：用户侧受保护路径 → 仅登录校验 ----
  if (userProtectedPaths.some(p => pathname.startsWith(p))) {
    return userAuth(request, traceId)
  }

  // ---- 分支 3：公开路径 → 直接放行 ----
  return NextResponse.next()
}

/**
 * admin 路径：JWT 签名 + 角色校验
 */
function adminAuth(request: NextRequest, traceId: string) {
  const { pathname } = request.nextUrl

  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: '未提供认证令牌' },
      { status: 401, headers: { 'x-trace-id': traceId } }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  let userRole = ''
  let userId = ''
  const payload = verifyJwtPayload(token)
  if (payload) {
    userRole = payload.role || ''
    userId = payload.userId || ''
  } else {
    return NextResponse.json(
      { success: false, error: '认证令牌无效或已过期' },
      { status: 401, headers: { 'x-trace-id': traceId } }
    )
  }

  const matchedPath = matchPath(pathname)
  if (matchedPath && userRole) {
    const requiredRoles = pathRoleMap[matchedPath]
    if (!requiredRoles.includes(userRole)) {
      return NextResponse.json(
        { success: false, error: '无权访问该接口' },
        { status: 403, headers: { 'x-trace-id': traceId } }
      )
    }
  }

  const requestHeaders = new Headers(request.headers)
  if (userId) requestHeaders.set('x-user-id', userId)
  if (userRole) requestHeaders.set('x-user-role', userRole)
  requestHeaders.set('x-trace-id', traceId)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

/**
 * 用户侧路径：仅 JWT 签名校验（不校验角色）
 */
function userAuth(request: NextRequest, traceId: string) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401, headers: { 'x-trace-id': traceId } }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  const payload = verifyJwtPayload(token)
  if (!payload) {
    return NextResponse.json(
      { success: false, error: '登录已过期，请重新登录' },
      { status: 401, headers: { 'x-trace-id': traceId } }
    )
  }

  const requestHeaders = new Headers(request.headers)
  if (payload.userId) requestHeaders.set('x-user-id', payload.userId)
  if (payload.role) requestHeaders.set('x-user-role', payload.role)
  requestHeaders.set('x-trace-id', traceId)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

// ---- 匹配器配置 ----

export const config = {
  // 排除 _next、静态文件、favicon 等
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
}

// 显式指定使用 Node.js Runtime，确保环境变量与 API 路由一致
export const runtime = 'nodejs'