import { NextRequest } from "next/server"
import { WithdrawalService } from "@/lib/services/withdrawal.service"
import { UserService } from "@/lib/services/user.service"
import { verifyToken } from "@/lib/utils/auth"
import { verifyPaymentPassword, checkPaymentPasswordLock, incrementFailedAttempt, resetPaymentPasswordLock, PAYMENT_LOCK_THRESHOLD } from "@/lib/auth/payment-password"
import { errorResponse, successResponse } from "@/lib/api-response"
import { AppErrorCode } from "@/lib/utils/error-codes"
import { logger } from "@/lib/logger"
import { z } from "zod"
import { parseBody, parseQuery } from "@/lib/validations/helper"

const withdrawalsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("20"),
})

const createWithdrawalSchema = z.object({
  amount: z.number().positive("????????0"),
  paymentMethod: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  bankName: z.string().optional(),
  paymentPassword: z.string().min(1, "???????"),
})


export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const { searchParams } = new URL(request.url)
    const qresult = parseQuery(withdrawalsQuerySchema, searchParams)
    const params = ('error' in qresult ? { page: "1", limit: "20" } : qresult.data) as Record<string, string | undefined>
    const page = parseInt(params.page || "1")
    const limit = parseInt(params.limit || "20")

    const result = await WithdrawalService.getUserWithdrawals(auth.userId, page, limit)

    return successResponse(result)
  } catch (error) {
    logger.error("Get withdrawals error:", error)
    return errorResponse("获取提现记录失败", 500, { code: AppErrorCode.INTERNAL_ERROR })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request)
    if (!auth) {
      return errorResponse("未登录", 401, { code: AppErrorCode.AUTH_REQUIRED })
    }

    const { amount, paymentMethod, accountNumber, accountName, bankName, paymentPassword } = await request.json()

    if (!amount || amount <= 0) {
      return errorResponse("提现金额必须大于0", 400, { code: AppErrorCode.VALIDATION_ERROR })
    }

    if (!paymentPassword) {
      return errorResponse("请输入支付密码", 400, { code: AppErrorCode.PAYMENT_PASSWORD_REQUIRED })
    }

    const paymentPasswordHash = await UserService.getPaymentPasswordHash(auth.userId)
    if (!paymentPasswordHash) {
      return errorResponse("请先设置支付密码", 400, { code: AppErrorCode.PAYMENT_PASSWORD_REQUIRED })
    }

    const lockStatus = await checkPaymentPasswordLock(auth.userId)
    if (lockStatus.locked) {
      return errorResponse(`支付密码已锁定，请${lockStatus.remainingMinutes}分钟后再试`, 423, { code: AppErrorCode.PAYMENT_PASSWORD_LOCKED })
    }

    const isValid = await verifyPaymentPassword(paymentPassword, paymentPasswordHash)
    if (!isValid) {
      const result = await incrementFailedAttempt(auth.userId)
      if (result.locked) {
        return errorResponse("支付密码已锁定，请15分钟后再试", 423, { code: AppErrorCode.PAYMENT_PASSWORD_LOCKED })
      }
      const remaining = PAYMENT_LOCK_THRESHOLD - result.attempts
      return errorResponse(`支付密码错误，剩余${remaining}次机会`, 401, { code: AppErrorCode.PAYMENT_PASSWORD_WRONG })
    }

    await resetPaymentPasswordLock(auth.userId)

    const withdrawal = await WithdrawalService.createWithdrawal(auth.userId, {
      amount,
      paymentMethod,
      accountNumber,
      accountName,
      bankName,
})

    return successResponse(withdrawal)
  } catch (error: unknown) {
    logger.error("Create withdrawal error:", error)
    const message = error instanceof Error ? error.message : "创建提现申请失败"
    return errorResponse(message, 400)
  }
}
