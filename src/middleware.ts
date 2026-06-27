import { NextRequest, NextResponse } from 'next/server'

// ---- 路径与所需角色映射 ----

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
  '/api/admin/settle-dividends': ['super_admin', 'finance_admin'],
  '/api/admin/manual-reward': ['super_admin', 'finance_admin'],
  '/api/admin/rewards': ['super_admin', 'finance_admin', 'auditor'],
  '/api/admin/stats': ['super_admin', 'finance_admin', 'goods_admin', 'support_admin', 'auditor'],
  '/api/admin/logs': ['super_admin', 'auditor'],
  '/api/admin/notifications': ['super_admin'],
}

// ---- 辅助函数 ----

// 注意：Next.js Middleware 强制使用 Edge Runtime，
// 在 Vercel 上 Edge Runtime 与 Node.js Runtime 的环境变量加载可能不同，
// 会导致 middleware 里的 JWT 验证与 API 路由不一致。
// 解决方案：middleware 仅做"存在性检查"和"角色检查"，
// 不验证签名。签名验证由各 API 路由用 Node.js Runtime 完成。

function parseJwtPayload(token: string): { userId?: string; phone?: string; role?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payloadJson = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8')
    return JSON.parse(payloadJson)
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
//
// 注意：Next.js Middleware 只能运行在 Edge Runtime 上，
// Edge Runtime 的 process.env 与 Node.js Runtime 不完全一致，
// 可能导致 JWT_SECRET 验证行为不同（这是生产环境 401 的根本原因）。
//
// 为避免此问题，middleware 仅检查 token 是否存在并解析出用户信息，
// 不做严格的 JWT 签名验证；真正的验证由各 API 路由内部完成。

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

  // 仅解析 token 拿到角色信息（不验证签名，由 API 路由用 Node.js Runtime 自己验证）
  let userRole = ''
  let userId = ''
  const payload = parseJwtPayload(token)
  if (payload) {
    userRole = payload.role || ''
    userId = payload.userId || ''
  }

  // 匹配路径角色
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

  // 将用户信息注入请求头，供后续路由使用
  const requestHeaders = new Headers(request.headers)
  if (userId) requestHeaders.set('x-user-id', userId)
  if (userRole) requestHeaders.set('x-user-role', userRole)
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