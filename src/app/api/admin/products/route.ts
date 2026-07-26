import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { logger } from "@/lib/logger"
import { ProductService } from "@/lib/services/product.service"
import { errorResponse, successResponse } from "@/lib/api-response"
import { parseBody } from "@/lib/validations/helper"
import { productCreateSchema } from "@/lib/validations/admin/products"

// GET /api/admin/products
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")))
    const search = searchParams.get("search")?.trim() || ""
    const isUpgrade = searchParams.get("isUpgrade")
    const status = searchParams.get("status") || ""

    const result = await ProductService.getAllProducts({
      page,
      pageSize,
      search: search || undefined,
      isUpgrade,
      status: status || undefined,
    })

    return successResponse(result.products, "????????", { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages })
  } catch (error) {
    logger.error("Admin get products error:", error)
    return errorResponse("????????", 500)
  }
}

// POST /api/admin/products
export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { data: body, error: parseError } = await parseBody(productCreateSchema, request)
    if (parseError) return parseError

    if (body.categoryId) {
      const exists = await ProductService.categoryExists(body.categoryId)
      if (!exists) return errorResponse("???????", 400)
    }

    const product = await ProductService.createProduct({
      name: body.name,
      description: body.description || null,
      imageUrl: body.imageUrl || null,
      retailPrice: body.retailPrice,
      memberPrice: body.memberPrice,
      stock: body.stock,
      isUpgradeProduct: body.isUpgradeProduct,
      maxPointsRatio: body.maxPointsRatio,
      benefits: body.benefits?.length ? body.benefits : null,
      status: body.status,
      sortOrder: body.sortOrder,
      categoryId: body.categoryId || null,
      specs: body.specs || null,
      research: body.research || null,
      images: body.images || null,
      videoUrl: body.videoUrl || null,
    })

    await logOperation({
      userId: admin.id,
      action: "CREATE",
      module: "product",
      targetId: product.id,
      newValue: { name: product.name },
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })

    return successResponse(product, "??????")
  } catch (error) {
    logger.error("Admin create product error:", error)
    return errorResponse("??????", 500)
  }
}
