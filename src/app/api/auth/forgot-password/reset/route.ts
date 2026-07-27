import { NextRequest } from 'next/server'
import { AuthService } from '@/lib/services/auth.service'
import { errorResponse, successResponse } from '@/lib/api-response'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'
import { z } from 'zod'
import { parseBody } from '@/lib/validations/helper'

const resetPasswordSchema = z.object({
  phone: z.string().min(1, '???????').regex(/^1[3-9]\d{9}$/, '????????'),
  code: z.string().min(1, '???????'),
  newPassword: z.string().min(8, '?????8?').regex(/[a-zA-Z]/, '????????').regex(/[0-9]/, '????????'),
})

// POST /api/auth/forgot-password/reset — 重置密码（手机号 + 验证码 + 新密码）
export async function POST(request: NextRequest) {
  try {
    // v56.1: rate-limit — 5 次/分钟/IP（防暴力重置）
    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`forgot-reset:ip:${clientIP}`, 5, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse('操作过于频繁，请稍后再试', ipLimitResult.resetIn)
    }

    const { phone, code, newPassword } = await request.json()

    if (!phone || typeof phone !== 'string') {
      return errorResponse('手机号不能为空', 400)
    }
    if (!code || typeof code !== 'string') {
      return errorResponse('验证码不能为空', 400)
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return errorResponse('新密码不能为空', 400)
    }

    await AuthService.resetPassword({ phone, code, newPassword })

    return successResponse(null, '密码重置成功')
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误'
    // 业务错误返回 400，系统错误返回 500
    const status = ['验证码无效或已过期', '新密码至少 8 位'].includes(errMsg) ? 400 : 500
    return errorResponse(errMsg, status)
  }
}
