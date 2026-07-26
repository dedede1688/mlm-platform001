import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { logger } from "@/lib/logger"
import { ProductService } from "@/lib/services/product.service"
import { errorResponse, successResponse } from "@/lib/api-response"
import { parseBody } from "@/lib/validations/helper"
import { productsBulkSchema } from "@/lib/validations/admin/products"

export async function PATCH(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { data: body, error: parseError } = await parseBody(productsBulkSchema, request)
    if (parseError) return parseError

    const result = await ProductService.bulkUpdateStatus(body.ids, body.status)

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
          newValue: { status: body.status },
          ip: request.headers.get("x-forwarded-for") || undefined,
          userAgent: request.headers.get("user-agent") || undefined,
        })
      )
    )

    return successResponse(
      { updated: result.updated, requested: result.requested, skipped: result.skipped },
      `${body.status === "active" ? "上架" : "下架"} ${result.updated} 个商品${result.skipped > 0 ? `，${result.skipped} 个已跳过` : ""}`
    )
  } catch (error) {
    logger.error("Admin bulk update products error:", error)
    return errorResponse("批量操作失败", 500)
  }
}
