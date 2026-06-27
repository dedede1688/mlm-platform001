import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/utils/auth'
import { AuthService } from '@/lib/services/auth.service'
import { errorResponse } from '@/lib/api-response'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'

// POST /api/auth/change-password — 用户改密（需登录 + 旧密码 + 新密码）
export async function POST(request: NextRequest) {
  try {
    // v56.1: rate-limit — 5 次/分钟/IP（防暴力试密码）
    const clientIP = getClientIP(request)
    const ipLimitResult = checkRateLimit(`change-password:ip:${clientIP}`, 5, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse('操作过于频繁，请稍后再试', ipLimitResult.resetIn)
    }

    // 1. 鉴权：必须登录
    const authUser = await verifyToken(request)
    if (!authUser) {
      return errorResponse('未登录或登录已过期', 401)
    }

    // 2. 解析请求体
    const { oldPassword, newPassword } = await request.json()

    if (!oldPassword || typeof oldPassword !== 'string') {
      return errorResponse('旧密码不能为空', 400)
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return errorResponse('新密码不能为空', 400)
    }

    // 3. 调用 AuthService
    await AuthService.changePassword({
      userId: authUser.userId,
      oldPassword,
      newPassword,
    })

    return NextResponse.json({
      success: true,
      message: '密码修改成功',
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误'
    // 业务错误返回 400，系统错误返回 500
    const status = ['旧密码错误', '新密码至少 8 位', '新密码不能与旧密码相同', '用户不存在'].includes(errMsg) ? 400 : 500
    return errorResponse(errMsg, status)
  }
}
