import { NextRequest } from 'next/server'
import { AuthService } from '@/lib/services/auth.service'
import { errorResponse, successResponse } from '@/lib/api-response'

// POST /api/auth/forgot-password/verify-code — 校验找回密码验证码
export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json()

    if (!phone || typeof phone !== 'string') {
      return errorResponse('手机号不能为空', 400)
    }
    if (!code || typeof code !== 'string') {
      return errorResponse('验证码不能为空', 400)
    }

    const result = await AuthService.verifyResetCode(phone, code)

    if (!result.valid) {
      return errorResponse('验证码无效或已过期', 400)
    }

    return successResponse({ valid: true }, '验证码校验通过')
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误'
    return errorResponse(`验证码校验失败：${errMsg}`, 500)
  }
}
