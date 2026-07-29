import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { RewardService } from "@/lib/services/reward.service"
import { logOperation } from "@/lib/utils/operation-log"
import { OrderNotificationService } from "@/lib/services/order-notification.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"

import { parseBody } from "@/lib/validations/helper"
import { manualRewardSchema } from "@/lib/validations/admin/manual-reward"

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["finance_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { data: body, error: parseError } = await parseBody(manualRewardSchema, request)
    if (parseError) return parseError

    const result = await RewardService.createManualReward({
      userId: body.userId,
      adminId: admin.id,
      amount: body.amount,
      type: body.type || undefined,
      reason: body.reason.trim(),
    })

    await logOperation({
      userId: admin.id,
      action: "CREATE",
      module: "finance",
      targetId: result.reward.id,
      newValue: { userId: body.userId, amount: body.amount, type: body.type || "manual", reason: body.reason.trim() },
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })

    await OrderNotificationService.notifyManualReward({
      userId: body.userId,
      amount: body.amount,
      reason: body.reason.trim(),
      operatorId: admin.id,
    })

    return successResponse(result, `已向用户发放 ¥${body.amount.toFixed(2)} 奖励`)
  } catch (error) {
    logger.error("Admin manual reward error:", error)
    return errorResponse(
      error instanceof Error ? error.message : "手动发放奖励失败",
      error instanceof Error && error.message === "用户不存在" ? 404 : 500
    )
  }
}
