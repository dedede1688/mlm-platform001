import { NextRequest } from "next/server"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { errorResponse, successResponse } from "@/lib/api-response"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { OrderService } from "@/lib/services/order.service"
import { logger } from "@/lib/logger"

// GET /api/admin/orders — 获取所有订单列表
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`orders:ip:${clientIP}`, 30, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse("请求过于频繁，请稍后再试", ipLimitResult.resetIn)
    }

    const { searchParams } = new URL(request.url)
    const result = await OrderService.getAdminOrders({
      page: Math.max(1, parseInt(searchParams.get("page") || "1")),
      pageSize: Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20"))),
      status: searchParams.get("status")?.trim() || undefined,
      search: searchParams.get("search")?.trim() || undefined,
    })

    return successResponse(
      result.orders,
      "获取订单列表成功",
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) }
    )
  } catch (error) {
    logger.error("Admin get orders error:", error)
    return errorResponse("获取订单列表失败", 500)
  }
}
