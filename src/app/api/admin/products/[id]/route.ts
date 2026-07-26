import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { logger } from "@/lib/logger"
import { ProductService } from "@/lib/services/product.service"
import { errorResponse, successResponse } from "@/lib/api-response"
import { parseBody } from "@/lib/validations/helper"
import { productUpdateSchema } from "@/lib/validations/admin/products"

// GET /api/admin/products/[id] -- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)--
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { id } = await params
    const product = await ProductService.getProductById(id, true)

    if (!product) {
      return errorResponse("?????", 404)
    }

    return successResponse(product, "????????")
  } catch (error) {
    logger.error("Admin get product error:", error)
    return errorResponse("????????", 500)
  }
}

// PUT /api/admin/products/[id] -- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)--
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { id } = await params

    const existing = await ProductService.getProductById(id)
    if (!existing) return errorResponse("?????", 404)

    const { data: body, error: parseError } = await parseBody(productUpdateSchema, request)
    if (parseError) return parseError

    if (Object.keys(body).length === 0) {
      return errorResponse("???????????", 400)
    }

    // ????????????????????? existing ??
    const finalRetail = body.retailPrice ?? existing.retailPrice
    const finalMember = body.memberPrice ?? existing.memberPrice
    if (Number(finalMember) > Number(finalRetail)) {
      return errorResponse("??????????", 400)
    }

    const data: Record<string, unknown> = {}

    for (const key of Object.keys(body) as (keyof typeof body)[]) {
      const val = body[key]
      if (val !== undefined) {
        if (key === "benefits") data[key] = val && (val as string[]).length > 0 ? val : null
        else if (key === "images") data[key] = val && (val as string[]).length > 0 ? val : null
        else if (key === "maxPointsRatio") data[key] = existing.isUpgradeProduct ? 0 : Math.min(50, val as number)
        else if (key === "categoryId") {
          if (val) {
            const exists = await ProductService.categoryExists(val as string)
            if (!exists) return errorResponse("???????", 400)
          }
          data[key] = (val as string) || null
        }
        else data[key] = val ?? null
      }
    }

    if (Object.keys(data).length === 0) {
      return errorResponse("???????????", 400)
    }

    const product = await ProductService.updateProduct(id, data)

    await logOperation({
      userId: admin.id,
      action: "UPDATE",
      module: "product",
      targetId: id,
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: data,
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })

    return successResponse(product, "??????")
  } catch (error) {
    logger.error("Admin update product error:", error)
    return errorResponse("??????", 500)
  }
}

// DELETE /api/admin/products/[id] -- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)-- (unicode)--
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { id } = await params

    const existing = await ProductService.getProductById(id)
    if (!existing) return errorResponse("?????", 404)

    if (existing.status === "deleted") {
      return errorResponse("??????", 400)
    }

    await ProductService.deleteProduct(id)

    await logOperation({
      userId: admin.id,
      action: "DELETE",
      module: "product",
      targetId: id,
      oldValue: { name: existing.name, status: existing.status },
      newValue: { status: "deleted" },
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })

    return successResponse(null, "?????")
  } catch (error) {
    logger.error("Admin delete product error:", error)
    return errorResponse("??????", 500)
  }
}
