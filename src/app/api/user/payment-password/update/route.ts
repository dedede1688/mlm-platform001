import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import {
  hashPaymentPassword,
  verifyPaymentPassword,
  isValidPaymentPassword,
} from '@/lib/auth/payment-password'

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
      return errorResponse('新密码必须为 6 位数字', 400)
    }

    // 查用户当前 hash
    const currentUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { paymentPasswordHash: true },
    })

    if (!currentUser?.paymentPasswordHash) {
      return errorResponse('尚未设置支付密码，请先设置', 400)
    }

    // 验证旧密码
    const valid = await verifyPaymentPassword(
      oldPassword,
      currentUser.paymentPasswordHash
    )
    if (!valid) {
      return errorResponse('旧密码错误', 401)
    }

    // 更新为新密码
    const newHash = await hashPaymentPassword(newPassword)
    await prisma.user.update({
      where: { id: user.userId },
      data: { paymentPasswordHash: newHash },
    })

    return successResponse(null, '支付密码修改成功')
  } catch (error: any) {
    console.error('修改支付密码失败:', error)
    return errorResponse('修改支付密码失败', 500)
  }
}
