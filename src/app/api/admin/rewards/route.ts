import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { RewardService } from "@/lib/services/reward.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"

export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["finance_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")))
    const type = searchParams.get("type")?.trim() || ""
    const search = searchParams.get("search")?.trim() || ""
    const startDate = searchParams.get("startDate")?.trim() || ""
    const endDate = searchParams.get("endDate")?.trim() || ""

    const raw = await RewardService.getRewardsList({
      page, pageSize,
      type: type || undefined,
      search: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })

    const { records, stats } = RewardService.formatRewardList({
      ...raw,
      type: type || undefined,
    })

    const total = type === "dividend"
      ? (raw.dividendTotal as number)
      : type
        ? (raw.rewardTotal as number)
        : (raw.rewardTotal as number) + (raw.dividendTotal as number)

    return successResponse(
      { records, stats },
      "获取奖励流水成功",
      { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    )
  } catch (error) {
    logger.error("Admin get rewards error:", error)
    return errorResponse(error instanceof Error ? error.message : "获取奖励流水失败", 500)
  }
}
