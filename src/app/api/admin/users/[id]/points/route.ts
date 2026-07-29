import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { PointsService } from "@/lib/services/points.service"
import { OrderNotificationService } from "@/lib/services/order-notification.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"

import { parseBody } from "@/lib/validations/helper"
import { userPointsAdjustSchema } from "@/lib/validations/admin/users"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError || !admin) return authError!
    const { id } = await params

    const { data: body, error: parseError } = await parseBody(userPointsAdjustSchema, request)
    if (parseError) return parseError

    const result = await PointsService.adminAdjustPoints({
      userId: id, type: body.type, amount: body.amount,
      reason: body.reason.trim(), adminId: admin.id,
    })
    await logOperation({
      userId: admin.id, action: "UPDATE", module: "user", targetId: id,
      oldValue: result.oldValue,
      newValue: {
        totalPoints: result.updated.totalPoints,
        unlockedPoints: result.updated.unlockedPoints,
        lockedPoints: result.updated.lockedPoints,
      },
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })
    const actionLabel = body.amount > 0 ? "增加" : "减少"
    logger.info(`[PointsAdjust] 用户 ${id} ${result.fieldLabel}${actionLabel} ${Math.abs(body.amount)}，原因：${body.reason}`)
    await OrderNotificationService.notifyPointsAdjust({
      userId: id, fieldLabel: result.fieldLabel, amount: body.amount,
      newTotalPoints: result.updated.totalPoints,
      newUnlockedPoints: result.updated.unlockedPoints,
      newLockedPoints: result.updated.lockedPoints,
      reason: body.reason.trim(), operatorId: admin.id,
    })
    return successResponse(
      { totalPoints: result.updated.totalPoints, unlockedPoints: result.updated.unlockedPoints, lockedPoints: result.updated.lockedPoints },
      `积分调整成功：${result.fieldLabel}${actionLabel} ${Math.abs(body.amount)}`
    )
  } catch (error) {
    logger.error("Adjust points error:", error)
    return errorResponse(error instanceof Error ? error.message : "积分调整失败", 500)
  }
}
