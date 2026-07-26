import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { PointsService } from "@/lib/services/points.service"
import { OrderNotificationService } from "@/lib/services/order-notification.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError || !admin) return authError!
    const { id } = await params
    const body = await request.json()
    const { type, amount, reason } = body
    if (!type || !["totalPoints", "unlockedPoints", "lockedPoints"].includes(type)) {
      return errorResponse("积分类型无效，必须为 totalPoints、unlockedPoints 或 lockedPoints", 400)
    }
    if (typeof amount !== "number" || amount === 0 || isNaN(amount)) {
      return errorResponse("积分调整量必须为非零数字", 400)
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return errorResponse("调整原因不少于5字", 400)
    }
    const result = await PointsService.adminAdjustPoints({ userId: id, type, amount, reason: reason.trim(), adminId: admin.id })
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
    const actionLabel = amount > 0 ? "增加" : "减少"
    logger.info(`[PointsAdjust] 用户 ${id} ${result.fieldLabel}${actionLabel} ${Math.abs(amount)}，原因：${reason}`)
    await OrderNotificationService.notifyPointsAdjust({
      userId: id, fieldLabel: result.fieldLabel, amount,
      newTotalPoints: result.updated.totalPoints,
      newUnlockedPoints: result.updated.unlockedPoints,
      newLockedPoints: result.updated.lockedPoints,
      reason: reason.trim(), operatorId: admin.id,
    })
    return successResponse(
      { totalPoints: result.updated.totalPoints, unlockedPoints: result.updated.unlockedPoints, lockedPoints: result.updated.lockedPoints },
      `积分调整成功：${result.fieldLabel}${actionLabel} ${Math.abs(amount)}`
    )
  } catch (error) {
    logger.error("Adjust points error:", error)
    return errorResponse(error instanceof Error ? error.message : "积分调整失败", 500)
  }
}
