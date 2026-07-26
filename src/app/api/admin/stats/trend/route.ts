import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { StatsService } from "@/lib/services/stats.service"

// ---- GET /api/admin/stats/trend?days=7 ----

export async function GET(request: NextRequest) {
  const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin", "support_admin", "auditor"])
  if (authError || !admin) return authError!

  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 7, 1), 90)

    const data = await StatsService.getTrend(days)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logger.error("获取趋势数据失败:", error)
    return NextResponse.json(
      { success: false, error: "获取趋势数据失败" },
      { status: 500 }
    )
  }
}
