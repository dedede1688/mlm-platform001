import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { ReportService } from "@/lib/services/report.service"

// GET /api/admin/reports/sales — 销售报告（v51.1）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30")))

    const data = await ReportService.getSalesReport(days)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logger.error("[Sales Report Error]", error)
    return NextResponse.json({ success: false, message: "服务器错误" }, { status: 500 })
  }
}
