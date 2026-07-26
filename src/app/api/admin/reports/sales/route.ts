import { NextRequest } from 'next/server'
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { ReportService } from "@/lib/services/report.service"
import { errorResponse, successResponse } from '@/lib/api-response'

// GET /api/admin/reports/sales — 销售报告（v51.1）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30")))

    const data = await ReportService.getSalesReport(days)
    return successResponse(data)
  } catch (error) {
    logger.error("[Sales Report Error]", error)
    return errorResponse("服务器错误", 500)
  }
}
