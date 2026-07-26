import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { toCsv, csvResponse } from "@/lib/utils/csv-export"
import { logger } from "@/lib/logger"
import { ExportService } from "@/lib/services/export.service"

// GET /api/admin/reports/export/members — 会员数据 CSV 导出（v51.2）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "support_admin", "auditor"])
    if (authError || !admin) return authError!

    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)

    const { levelRows, referrerRow, activityRows } = await ExportService.getMembersExport()

    const csv = [
      `# 会员等级分布（${dateStr}）`,
      toCsv(levelRows, [{ key: "level", label: "等级" }, { key: "label", label: "身份" }, { key: "count", label: "人数" }]),
      `# 推荐转化`,
      toCsv([referrerRow], [{ key: "totalUsers", label: "总会员" }, { key: "withReferrer", label: "有推荐人" }, { key: "conversionRate", label: "推荐转化率" }]),
      `# 活跃度`,
      toCsv(activityRows, [{ key: "metric", label: "指标" }, { key: "count", label: "人数" }, { key: "ratio", label: "占总会员比" }]),
    ].join("\n")

    return csvResponse(csv, `会员报告_${dateStr}`)
  } catch (error) {
    logger.error("[Members CSV Export Error]", error)
    return new Response("服务器错误", { status: 500 })
  }
}
