import { NextRequest } from 'next/server'
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { ReportService } from "@/lib/services/report.service"
import { errorResponse, successResponse } from '@/lib/api-response'

// GET /api/admin/reports/funnel — 转化漏斗（v51.3）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "support_admin", "finance_admin", "auditor"])
    if (authError || !admin) return authError!

    const data = await ReportService.getFunnelReport()
    return successResponse(data)
  } catch (error) {
    logger.error("[Funnel Report Error]", error)
    return errorResponse("服务器错误", 500)
  }
}
