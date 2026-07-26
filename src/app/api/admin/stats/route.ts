import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { cached } from "@/lib/utils/stats-cache"
import { logger } from "@/lib/logger"
import { StatsService } from "@/lib/services/stats.service"

// ---- GET /api/admin/stats ----

export async function GET(request: NextRequest) {
  const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin", "support_admin", "auditor"])
  if (authError || !admin) return authError!

  try {
    // v51.5: stats 包装 5 分钟缓存
    const data = await cached("admin-stats", () => StatsService.getStats())
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logger.error("获取统计数据失败:", error)
    return NextResponse.json(
      { success: false, error: "获取统计数据失败" },
      { status: 500 }
    )
  }
}
