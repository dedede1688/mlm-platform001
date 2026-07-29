import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'
import { UserService } from '@/lib/services/user.service'
import { verifyToken } from '@/lib/utils/auth'

import { errorResponse, successResponse } from '@/lib/api-response'
import { hashPaymentPassword } from '@/lib/auth/payment-password'
import { isValidNewPaymentPassword } from '@/lib/validations/payment-password-policy'

// POST /api/user/payment-password/set — 设置支付密码
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const body = await request.json()
    const { password } = body as { password: string }

    // 运行时类型守卫：password 必须是字符串
    if (typeof password !== 'string' || !password || !isValidNewPaymentPassword(password)) {
      return errorResponse('支付密码必须为6位数字', 400)
    }

    // 检查用户是否已设置支付密码
    const existingHash = await UserService.getPaymentPasswordHash(user.userId)
    if (existingHash) {
      return errorResponse('支付密码已存在，请使用修改接口', 400)
    }

    // Hash 并存储
    const hashed = await hashPaymentPassword(password)
    await UserService.setPaymentPasswordHash(user.userId, hashed)

    return successResponse(null, '支付密码设置成功')
  } catch (error: unknown) {
    logger.error('设置支付密码失败:', error)
    return errorResponse('设置支付密码失败', 500)
  }
}
