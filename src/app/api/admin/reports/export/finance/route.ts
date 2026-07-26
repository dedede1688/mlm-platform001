import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { toCsv, csvResponse } from "@/lib/utils/csv-export"
import { logger } from "@/lib/logger"
import { ExportService } from "@/lib/services/export.service"

// GET /api/admin/reports/export/finance?days=30 — 财务数据 CSV 导出（v51.2）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "auditor"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30")))

    const rows = await ExportService.getFinanceExport(days)

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)
    const dateStr = now.toISOString().slice(0, 10)
    const csv = toCsv(rows, [{ key: "metric", label: "指标" }, { key: "amount", label: "金额（元）" }])
    return csvResponse(`# 财务报告（${startDate.toISOString().slice(0, 10)} 至 ${dateStr}，近${days}天）\n${csv}`, `财务报告_${days}天_${dateStr}`)
  } catch (error) {
    logger.error("[Finance CSV Export Error]", error)
    return new Response("服务器错误", { status: 500 })
  }
}
