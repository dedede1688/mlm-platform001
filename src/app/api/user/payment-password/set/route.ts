import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'
import { UserService } from '@/lib/services/user.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import {
  hashPaymentPassword,
  isValidPaymentPassword,
} from '@/lib/auth/payment-password'

// POST /api/user/payment-password/set — 设置支付密码
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const body = await request.json()
    const { password } = body as { password: string }

    // 校验密码格式
    if (!password || !isValidPaymentPassword(password)) {
      return errorResponse('支付密码至少6位，必须同时包含字母和数字', 400)
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
