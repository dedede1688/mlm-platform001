import { NextRequest } from 'next/server'
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { StatsService } from "@/lib/services/stats.service"
import { errorResponse, successResponse } from '@/lib/api-response'

// ---- GET /api/admin/stats/trend?days=7 ----

export async function GET(request: NextRequest) {
  const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin", "support_admin", "auditor"])
  if (authError || !admin) return authError!

  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 7, 1), 90)

    const data = await StatsService.getTrend(days)
    return successResponse(data)
  } catch (error) {
    logger.error("获取趋势数据失败:", error)
    return errorResponse("获取趋势数据失败", 500)
  }
}
