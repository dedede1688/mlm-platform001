import { NextRequest } from 'next/server'
import { AuthService } from '@/lib/services/auth.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'

// POST /api/auth/forgot-password/send-code — 发送找回密码验证码
export async function POST(request: NextRequest) {
  try {
    // v56.1: rate-limit — 3 次/分钟/IP（防短信轰炸）
    const clientIP = getClientIP(request)
    const ipLimitResult = checkRateLimit(`forgot-send:ip:${clientIP}`, 3, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse('请求过于频繁，请稍后再试', ipLimitResult.resetIn)
    }

    const { phone } = await request.json()

    if (!phone || typeof phone !== 'string') {
      return errorResponse('手机号不能为空', 400)
    }

    // 手机号格式校验
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return errorResponse('手机号格式不正确', 400)
    }

    // 手机号维度限流（防针对单号轰炸）
    const phoneLimitResult = checkRateLimit(`forgot-send:phone:${phone}`, 3, 60 * 1000)
    if (!phoneLimitResult.allowed) {
      return rateLimitResponse('该手机号请求过于频繁，请稍后再试', phoneLimitResult.resetIn)
    }

    const result = await AuthService.sendResetCode(phone)

    // 安全考虑：无论手机号是否存在，都返回成功（避免泄露用户存在性）
    return successResponse({ expiresIn: result.expiresIn }, '验证码已发送')
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误'
    return errorResponse(`发送验证码失败：${errMsg}`, 500)
  }
}
