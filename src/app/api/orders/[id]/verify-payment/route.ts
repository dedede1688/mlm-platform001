import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPaymentPassword } from '@/lib/auth/payment-password'
import { RewardService } from '@/lib/services/reward.service'
import { ORDER_STATUS } from '@/lib/constants'

// POST /api/orders/[id]/verify-payment — 验证支付密码 + 标记已支付
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orderId = (await params).id

  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const body = await request.json()
    const { password } = body as { password: string }

    if (!password) {
      return errorResponse('请输入支付密码', 400)
    }

    // 查订单
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    })

    if (!order) {
      return errorResponse('订单不存在', 404)
    }

    // 归属校验
    if (order.userId !== user.userId) {
      return errorResponse('无权操作此订单', 403)
    }

    // 状态校验：仅待支付可验证
    if (order.status !== ORDER_STATUS.PENDING) {
      return errorResponse('订单状态不允许此操作', 400)
    }

    // 查用户支付密码 hash（分开查询避免嵌套 select 类型问题）
    const pwUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { paymentPasswordHash: true },
    })

    // 校验支付密码
    const pwHash = pwUser?.paymentPasswordHash
    if (!pwHash) {
      return errorResponse('尚未设置支付密码，请先设置', 400)
    }

    const valid = await verifyPaymentPassword(password, pwHash)
    if (!valid) {
      return errorResponse('支付密码错误', 401)
    }

    // 事务：标记订单为已支付 + paymentVerified = true
    // v43-4-修复-2: 这里已经把 status 改为 paid，不要再调 payOrder（会重复 updateMany 失败）
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: ORDER_STATUS.PENDING },
        data: {
          status: ORDER_STATUS.PAID,
          paymentVerified: true,
          paidAt: new Date(),
        },
      })

      if (updated.count === 0) {
        throw new Error('订单不存在或状态已变更')
      }
    })

    // 触发奖励发放（直接调 RewardService，避免 payOrder 重复 update status 失败）
    await RewardService.processOrderRewards(orderId)

    return successResponse(
      { orderId, status: 'paid' },
      '支付成功'
    )
  } catch (error: any) {
    console.error('验证支付失败:', error)
    const msg =
      error.message === '支付密码错误'
        ? '支付密码错误'
        : error.message || '支付失败'
    return errorResponse(msg, error.message === '支付密码错误' ? 401 : 500)
  }
}
