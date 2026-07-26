import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { LogService } from "@/lib/services/log.service"
import { logger } from "@/lib/logger"

// GET /api/admin/logs — 获取操作日志列表（super_admin, auditor）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "auditor"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")))
    const logModule = searchParams.get("module")?.trim() || ""
    const action = searchParams.get("action")?.trim() || ""
    const userId = searchParams.get("userId")?.trim() || ""
    const startDate = searchParams.get("startDate")?.trim() || ""
    const endDate = searchParams.get("endDate")?.trim() || ""

    const { data: logs, pagination: svcPagination } = await LogService.getOperationLogs(page, pageSize, {
      module: logModule || undefined,
      action: action || undefined,
      userId: userId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })

    return NextResponse.json({
      success: true,
      data: logs,
      message: "获取操作日志成功",
      pagination: {
        page,
        pageSize: svcPagination.limit,
        total: svcPagination.total,
        totalPages: svcPagination.totalPages,
      },
    })
  } catch (error) {
    logger.error("Admin get operation logs error:", error)
    return NextResponse.json(
      { success: false, message: "获取操作日志失败" },
      { status: 500 }
    )
  }
}
