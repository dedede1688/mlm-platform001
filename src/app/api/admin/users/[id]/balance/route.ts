import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { invalidateCache } from "@/lib/utils/stats-cache"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { BalanceService } from "@/lib/services/balance.service"
import { OrderNotificationService } from "@/lib/services/order-notification.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"

const VALID_TYPES = ["balance", "frozenBalance", "recharge", "consume_void", "earnings_add", "earnings_void"] as const
type AdjustType = typeof VALID_TYPES[number]

const TYPE_LABEL_MAP: Record<AdjustType, string> = {
  balance: "余额",
  frozenBalance: "冻结余额",
  recharge: "余额/消费余额",
  consume_void: "余额/消费余额",
  earnings_add: "可提现收益",
  earnings_void: "累计作废",
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    invalidateCache("admin-stats")

    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`balance-adjust:ip:${clientIP}`, 10, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse("调账请求过于频繁，请稍后再试", ipLimitResult.resetIn)
    }

    const { user: admin, error: authError } = await verifyPermission(
      request, ["finance_admin", "super_admin"]
    )
    if (authError || !admin) return authError!

    const { id } = await params
    const body = await request.json()
    const { type, amount, reason } = body

    if (!type || !VALID_TYPES.includes(type as AdjustType)) {
      return errorResponse(`type 必须为 ${VALID_TYPES.join(" / ")}`, 400)
    }

    const adjustType: AdjustType = type as AdjustType

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
      return errorResponse("amount 必须为非零有限数字", 400)
    }

    if (adjustType === "earnings_void" && amount <= 0) {
      return errorResponse("作废收益金额必须为正数", 400)
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return errorResponse("原因至少 5 个字", 400)
    }

    const result = await BalanceService.adjustBalance({
      userId: id,
      adminId: admin.id,
      type,
      amount,
      reason: reason.trim(),
    })

    if (!result.updated) {
      return errorResponse("更新后查询用户失败", 500)
    }

    const fieldLabel = TYPE_LABEL_MAP[adjustType] || result.mapping.label

    await logOperation({
      userId: admin.id,
      action: "UPDATE",
      module: "user",
      targetId: id,
      oldValue: result.oldValue,
      newValue: adjustType === "earnings_void"
        ? { earningsAvailable: result.updated.earningsAvailable, earningsVoided: result.updated.earningsVoided }
        : { [result.mapping.main]: result.updated[result.mapping.main as keyof typeof result.updated] },
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })

    if (adjustType === "earnings_void") {
      await OrderNotificationService.notifyEarningsVoid({
        userId: id,
        amount,
        earningsAvailable: result.updated.earningsAvailable,
        earningsVoided: result.updated.earningsVoided,
        reason: reason.trim(),
        operatorId: admin.id,
        balanceRecordId: result.balanceRecordId!,
      }).catch((err) => {
        logger.error("[v006 notifyEarningsVoid route catch]", { error: String(err) })
      })
    } else {
      await OrderNotificationService.notifyBalanceChange({
        userId: id,
        adjustType: type as string,
        amount,
        newBalance: result.updated.balance,
        reason: reason.trim(),
        operatorId: admin.id,
      })
    }

    const actionLabel = amount > 0 ? "增加" : "扣减"
    logger.info(
      `[BalanceAdjust] 用户 ${id} 的${fieldLabel}已${actionLabel} ¥${Math.abs(amount).toFixed(2)}，原因：${reason}`
    )

    if (adjustType === "earnings_void") {
      return successResponse(
        { earningsAvailable: result.updated.earningsAvailable, earningsVoided: result.updated.earningsVoided },
        `收益作废成功：可用收益减少 ¥${amount.toFixed(2)}，累计作废 ¥${result.updated.earningsVoided.toFixed(2)}`
      )
    }

    const responseData: Record<string, number> = {
      [result.mapping.main]: result.updated[result.mapping.main as keyof typeof result.updated] as number,
    }
    if (result.mapping.extra) {
      responseData[result.mapping.extra] = (result.updated as Record<string, unknown>)[result.mapping.extra] as number
    }

    return successResponse(responseData, `资金调整成功：${fieldLabel}${actionLabel} ¥${Math.abs(amount).toFixed(2)}`)
  } catch (error) {
    logger.error("Adjust balance error:", error)
    const message = error instanceof Error ? error.message : "资金调整失败"
    const isBusinessError = message === "可用收益不足"
    return errorResponse(message, isBusinessError ? 400 : 500)
  }
}
