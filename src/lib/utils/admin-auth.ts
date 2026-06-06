import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { prisma } from '@/lib/prisma'

/**
 * 角色权限验证中间件
 * 从 token 获取用户信息，检查用户角色是否在 allowedRoles 中
 * 未登录或角色不符返回 403 响应；否则返回用户对象
 */
export async function verifyPermission(req: NextRequest, allowedRoles: string[]) {
  const authUser = await verifyToken(req)
  if (!authUser) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, message: '未登录或登录已过期' },
        { status: 403 }
      ),
    }
  }

  const userInfo = await prisma.user.findUnique({ where: { id: authUser.userId } })
  if (!userInfo) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, message: '用户不存在' },
        { status: 403 }
      ),
    }
  }

  if (!allowedRoles.includes(userInfo.role)) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, message: '权限不足' },
        { status: 403 }
      ),
    }
  }

  return { user: userInfo, error: null }
}

/**
 * 管理员权限验证（兼容函数）
 * 内部调用 verifyPermission，允许所有管理员角色
 */
export async function verifyAdmin(request: NextRequest) {
  const { user, error } = await verifyPermission(request, [
    'super_admin',
    'goods_admin',
    'finance_admin',
    'support_admin',
    'auditor',
  ])

  if (error || !user) return null
  return user
}