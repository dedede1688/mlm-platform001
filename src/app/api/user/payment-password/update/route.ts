import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'
import { UserService } from '@/lib/services/user.service'
import { verifyToken } from '@/lib/utils/auth'
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import { parseBody } from '@/lib/validations/helper'
import {
  hashPaymentPassword,
  verifyPaymentPassword,
  isValidPaymentPassword,
  checkPaymentPasswordLock,
  incrementFailedAttempt,
  resetPaymentPasswordLock,
  PAYMENT_LOCK_THRESHOLD,
} from '@/lib/auth/payment-password'

const updatePaymentPasswordSchema = z.object({
  oldPassword: z.string().min(1, '??????'),
  newPassword: z.string().min(1, '??????').refine(
    (val) => isValidPaymentPassword(val),
    '??????6?????????????'
  ),
})

// PUT /api/user/payment-password/update — 修改支付密码
export async function PUT(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const body = await request.json()
    const { oldPassword, newPassword } = body as {
      oldPassword: string
      newPassword: string
    }

    if (!oldPassword || !newPassword) {
      return errorResponse('请提供旧密码和新密码', 400)
    }

    // 校验新密码格式
    if (!isValidPaymentPassword(newPassword)) {
      return errorResponse('支付密码至少6位，必须同时包含字母和数字', 400)
    }

    // 获取用户当前 hash
    const currentHash = await UserService.getPaymentPasswordHash(user.userId)
    if (!currentHash) {
      return errorResponse('尚未设置支付密码，请先设置', 400)
    }

    const lockStatus = await checkPaymentPasswordLock(user.userId)
    if (lockStatus.locked) {
      return errorResponse(`支付密码已锁定，请${lockStatus.remainingMinutes}分钟后再试`, 423)
    }

    const valid = await verifyPaymentPassword(
      oldPassword,
      currentHash
    )
    if (!valid) {
      const result = await incrementFailedAttempt(user.userId)
      if (result.locked) {
        return errorResponse('支付密码已锁定，请15分钟后再试', 423)
      }
      const remaining = PAYMENT_LOCK_THRESHOLD - result.attempts
      return errorResponse(`支付密码错误，剩余${remaining}次机会`, 401)
    }

    await resetPaymentPasswordLock(user.userId)

    // 更新为新密码
    const newHash = await hashPaymentPassword(newPassword)
    await UserService.setPaymentPasswordHash(user.userId, newHash)

    return successResponse(null, '支付密码修改成功')
  } catch (error: unknown) {
    logger.error('修改支付密码失败:', error)
    return errorResponse('修改支付密码失败', 500)
  }
}
