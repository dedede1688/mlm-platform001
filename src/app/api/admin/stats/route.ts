import { NextRequest } from 'next/server'
import { verifyPermission } from "@/lib/utils/admin-auth"
import { cached } from "@/lib/utils/stats-cache"
import { logger } from "@/lib/logger"
import { StatsService } from "@/lib/services/stats.service"
import { errorResponse, successResponse } from '@/lib/api-response'

// ---- GET /api/admin/stats ----

export async function GET(request: NextRequest) {
  const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin", "support_admin", "auditor"])
  if (authError || !admin) return authError!

  try {
    // v51.5: stats 包装 5 分钟缓存
    const data = await cached("admin-stats", () => StatsService.getStats())
    return successResponse(data)
  } catch (error) {
    logger.error("获取统计数据失败:", error)
    return errorResponse("获取统计数据失败", 500)
  }
}
