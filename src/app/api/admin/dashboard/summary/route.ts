import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from "@/lib/api-response"
import { logger } from "@/lib/logger"
import { StatsService } from "@/lib/services/stats.service"

// v67: 数据中心 summary API
// 返回: 昨日日报(销售/订单/用户/退款/提现 对比上周同日)
//     + 今日异常(待审退款/待审提现/待发货/库存预警列表)
//     + 当前时间戳(供前端 30 秒刷新判断)
// 所有 admin 角色都能读

export async function GET(request: NextRequest) {
  const { user, error } = await verifyPermission(request, [
    "super_admin", "goods_admin", "finance_admin", "support_admin", "auditor",
  ])
  if (error || !user) return error || errorResponse("未授权", 401)

  try {
    const data = await StatsService.getDashboardSummary()
    return successResponse(data)
  } catch (err: unknown) {
    logger.error("[Dashboard Summary] 错误:", err)
    return errorResponse(err instanceof Error ? err.message : "获取数据失败", 500)
  }
}
