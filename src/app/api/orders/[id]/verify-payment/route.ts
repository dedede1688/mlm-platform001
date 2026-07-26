import { NextRequest } from "next/server"
import { verifyToken } from "@/lib/utils/auth"
import { errorResponse, successResponse } from "@/lib/api-response"
import { AppErrorCode } from "@/lib/utils/error-codes"
import { OrderLifecycleService } from "@/lib/services/order-lifecycle.service"
import { invalidateCache } from "@/lib/utils/stats-cache"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { logger } from "@/lib/logger"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const orderId = (await params).id

  try {
    invalidateCache("admin-stats")

    // rate-limit
    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`verify-payment:ip:${clientIP}`, 10, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse("支付请求过于频繁，请稍后再试", ipLimitResult.resetIn)
    }

    const user = await verifyToken(request)
    if (!user) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const body = await request.json()
    const { password } = body as { password: string }

    if (!password) {
      return errorResponse("请输入支付密码", 400, { code: AppErrorCode.PAYMENT_PASSWORD_REQUIRED })
    }

    // 核心支付逻辑委托给生命周期服务（含归属校验、密码校验、余额扣减、奖励发放、通知）
    const paidOrder = await OrderLifecycleService.verifyPayment(orderId, user.userId, password)

    const unlockRequired = (paidOrder as any).unlockRequired ?? false
    const unlockAmount = (paidOrder as any).unlockAmount

    return successResponse(
      {
        orderId,
        status: "paid",
        unlockRequired,
        unlockAmount,
      },
      "支付成功"
    )
  } catch (error: unknown) {
    logger.error("验证支付失败:", error)

    const errMsg = error instanceof Error ? error.message : ""
    if (errMsg === "可用余额不足") {
      return errorResponse("可用余额不足", 400, {
        code: AppErrorCode.INSUFFICIENT_BALANCE,
        data: { shortage: 0 },
      })
    }

    if (errMsg === "支付密码错误") {
      return errorResponse("支付密码错误", 401, { code: AppErrorCode.PAYMENT_PASSWORD_WRONG })
    }

    const msg = error instanceof Error ? error.message : "支付失败"
    return errorResponse(msg, 500, { code: AppErrorCode.INTERNAL_ERROR })
  }
}
