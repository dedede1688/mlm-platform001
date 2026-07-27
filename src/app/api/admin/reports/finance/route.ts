import { NextRequest } from 'next/server'
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { ReportService } from "@/lib/services/report.service"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from '@/lib/api-response'

// GET /api/admin/reports/finance — 财务报告（v51.1）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "auditor"])
    if (authError || !admin) return authError!

    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`reports-finance:ip:${clientIP}`, 30, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse("请求过于频繁，请稍后再试", ipLimitResult.resetIn)
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30")))

    const data = await ReportService.getFinanceReport(days)
    return successResponse(data)
  } catch (error) {
    logger.error("[Finance Report Error]", error)
    return errorResponse("服务器错误", 500)
  }
}
