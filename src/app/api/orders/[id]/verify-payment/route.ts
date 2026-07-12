import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { verifyPaymentPassword } from '@/lib/auth/payment-password'
import { RewardService } from '@/lib/services/reward.service'
import { OrderNotificationService } from '@/lib/services/order-notification.service'
import { invalidateCache } from '@/lib/utils/stats-cache'
import { checkRateLimit, getClientIP, rateLimitResponse } from '@/lib/utils/rate-limit'
import { ORDER_STATUS, BALANCE_SELECT } from '@/lib/constants'
import { format4FieldDelta } from '@/lib/utils/balance-record-desc'

// POST /api/orders/[id]/verify-payment — 验证支付密码 + 标记已支付
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orderId = (await params).id

  // 事务外声明：捕获余额信息供 catch 块结构化错误使用（ref 对象避免 TS 控制流窄化为 null）
  const paymentContextRef = { current: null as { balance: number; payAmount: number } | null }

  try {
    invalidateCache('admin-stats')  // v51.5: 支付成功后 stats 失效

    // v52.1: rate-limit - IP 维度，10 次/分钟（防暴力支付）
    const clientIP = getClientIP(request)
    const ipLimitResult = checkRateLimit(`verify-payment:ip:${clientIP}`, 10, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse('支付请求过于频繁，请稍后再试', ipLimitResult.resetIn)
    }

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

    // 事务：标记订单为已支付 + 扣减余额 + 写 balance_record（原子操作）
    // v43-6-批次-2: 余额不足时整个事务回滚，订单保持 PENDING
    await prisma.$transaction(async (tx) => {
      // 1. 标记订单为已支付（原有逻辑）
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

      // 2. v43-6-批次-2: 扣减余额（仅当 payAmount > 0 时）
      if (order.payAmount > 0) {
        // 事务内查用户当前余额（防并发透支）
        const freshUser = await tx.user.findUnique({
          where: { id: order.userId },
          select: BALANCE_SELECT,
        })
        if (!freshUser) {
          throw new Error('用户不存在')
        }

        // 捕获余额信息供 catch 块结构化错误使用
        paymentContextRef.current = { balance: freshUser.balance, payAmount: order.payAmount }

        // 原子扣减余额（条件 balance >= payAmount 防止透支）
        const balanceUpdated = await tx.user.updateMany({
          where: {
            id: order.userId,
            balance: { gte: order.payAmount },
          },
          data: {
            balance: { decrement: order.payAmount },
            consumeBalance: { increment: order.payAmount },
          },
        })
        if (balanceUpdated.count === 0) {
          throw new Error('可用余额不足')
        }

        // 3. 写 balance_record（流水）
        const newBalance = freshUser.balance - order.payAmount
        const afterPay = { consumeBalance: freshUser.consumeBalance + order.payAmount, earningsAvailable: freshUser.earningsAvailable, earningsPending: freshUser.earningsPending, earningsVoided: freshUser.earningsVoided }
        await tx.balanceRecord.create({
          data: {
            userId: order.userId,
            type: 'payment',
            amount: -order.payAmount,
            balance: newBalance,
            frozenBalance: freshUser.frozenBalance,
            sourceType: 'order',
            sourceId: orderId,
            description: `订单 ${order.orderNo} 支付${format4FieldDelta(freshUser, afterPay)}`,
          },
        })
      }
    })

    // 触发奖励发放（直接调 RewardService，避免 payOrder 重复 update status 失败）
    const rewardResult = await RewardService.processOrderRewards(orderId)

    // v46.10.3: 触发订单支付通知（修复 verify-payment 不调 payOrder 导致的 IIFE 死代码）
    await OrderNotificationService.notifyOrderPaid(orderId)

    return successResponse(
      {
        orderId,
        status: 'paid',
        // v50 F: 透传推荐奖未解锁信号，前端据此弹 Toast 提示用户购买升级品
        unlockRequired: rewardResult?.referralUnlockRequired ?? false,
        unlockAmount: rewardResult?.referralUnlockAmount,
      },
      '支付成功'
    )
  } catch (error: any) {
    console.error('验证支付失败:', error)

    // 余额不足：返回结构化错误（前端可据此弹收益转余额浮窗）
    if (error.message === '可用余额不足' && paymentContextRef.current) {
      const ctx = paymentContextRef.current
      const shortage = ctx.payAmount - ctx.balance
      return errorResponse('可用余额不足', 400, {
        code: 'INSUFFICIENT_BALANCE',
        data: {
          balance: ctx.balance,
          payAmount: ctx.payAmount,
          shortage,
        },
      })
    }

    const msg =
      error.message === '支付密码错误'
        ? '支付密码错误'
        : error.message || '支付失败'
    return errorResponse(msg, error.message === '支付密码错误' ? 401 : 500)
  }
}
