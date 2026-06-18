import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
      return errorResponse('支付密码必须为 6 位数字', 400)
    }

    // 查用户是否已设置支付密码
    const existing = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { paymentPasswordHash: true },
    })

    if (existing?.paymentPasswordHash) {
      return errorResponse('支付密码已存在，请使用修改接口', 400)
    }

    // Hash 并存储
    const hashed = await hashPaymentPassword(password)
    await prisma.user.update({
      where: { id: user.userId },
      data: { paymentPasswordHash: hashed },
    })

    return successResponse(null, '支付密码设置成功')
  } catch (error: any) {
    console.error('设置支付密码失败:', error)
    return errorResponse('设置支付密码失败', 500)
  }
}
