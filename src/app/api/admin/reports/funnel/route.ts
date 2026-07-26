import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { ReportService } from "@/lib/services/report.service"

// GET /api/admin/reports/funnel — 转化漏斗（v51.3）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "support_admin", "finance_admin", "auditor"])
    if (authError || !admin) return authError!

    const data = await ReportService.getFunnelReport()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logger.error("[Funnel Report Error]", error)
    return NextResponse.json({ success: false, message: "服务器错误" }, { status: 500 })
  }
}
