import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { OrderLifecycleService } from "@/lib/services/order-lifecycle.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from '@/lib/api-response'

// GET /api/admin/refunds — 获取退款申请列表
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")))
    const status = searchParams.get("status")?.trim() || ""
    const search = searchParams.get("search")?.trim() || ""

    const { data, pagination: svcPagination } = await OrderLifecycleService.getAdminRefunds(page, pageSize, { status, search })

    return successResponse(
      {
        records: data,
        pagination: {
          page,
          pageSize: svcPagination.limit,
          total: svcPagination.total,
          totalPages: svcPagination.totalPages,
        },
      },
      "获取退款申请列表成功"
    )
  } catch (error) {
    logger.error("Admin get refunds error:", error)
    return errorResponse("获取退款申请列表失败", 500)
  }
}
