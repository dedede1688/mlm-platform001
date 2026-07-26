import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { logger } from "@/lib/logger"
import { ProductService } from "@/lib/services/product.service"
import { errorResponse, successResponse } from "@/lib/api-response"

export async function PATCH(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const body = await request.json()
    const { ids, status } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse("ids 必须为非空数组", 400)
    }

    if (!["active", "inactive"].includes(status)) {
      return errorResponse("status 只能为 active 或 inactive", 400)
    }

    if (ids.length > 200) {
      return errorResponse("单次最多批量操作 200 个商品", 400)
    }

    const result = await ProductService.bulkUpdateStatus(ids as string[], status as "active" | "inactive")

    if (result.updated === 0) {
      return errorResponse("没有可操作的商品（可能都已删除）", 404)
    }

    await Promise.all(
      result.products.map(p =>
        logOperation({
          userId: admin.id,
          action: "UPDATE",
          module: "product",
          targetId: p.id,
          oldValue: { status: p.status },
          newValue: { status },
          ip: request.headers.get("x-forwarded-for") || undefined,
          userAgent: request.headers.get("user-agent") || undefined,
        })
      )
    )

    return successResponse(
      { updated: result.updated, requested: result.requested, skipped: result.skipped },
      `${status === "active" ? "上架" : "下架"} ${result.updated} 个商品${result.skipped > 0 ? `，${result.skipped} 个已跳过` : ""}`
    )
  } catch (error) {
    logger.error("Admin bulk update products error:", error)
    return errorResponse("批量操作失败", 500)
  }
}
