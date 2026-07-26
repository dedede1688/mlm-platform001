import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { logger } from "@/lib/logger"
import { ProductService } from "@/lib/services/product.service"
import { errorResponse, successResponse } from "@/lib/api-response"

// GET /api/admin/products/[id] —— 获取单个商品详情
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
      return errorResponse("商品不存在", 404)
    }

    return successResponse(product, "获取商品详情成功")
  } catch (error) {
    logger.error("Admin get product error:", error)
    return errorResponse("获取商品详情失败", 500)
  }
}

// PUT /api/admin/products/[id] —— 更新商品信息（支持部分更新）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { id } = await params

    // 检查商品是否存在
    const existing = await ProductService.getProductById(id)
    if (!existing) {
      return errorResponse("商品不存在", 404)
    }

    const body = await request.json()

    // 构建更新数据（只更新传入的字段）
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      if (!body.name || typeof body.name !== "string") {
        return errorResponse("商品名称不能为空", 400)
      }
      data.name = body.name
    }

    if (body.description !== undefined) {
      data.description = body.description || null
    }

    if (body.imageUrl !== undefined) {
      data.imageUrl = body.imageUrl || null
    }

    if (body.retailPrice !== undefined) {
      const price = Number(body.retailPrice)
      if (isNaN(price) || price <= 0) {
        return errorResponse("零售价必须大于0", 400)
      }
      data.retailPrice = price
    }

    if (body.memberPrice !== undefined) {
      const price = Number(body.memberPrice)
      if (isNaN(price) || price <= 0) {
        return errorResponse("会员价必须大于0", 400)
      }
      data.memberPrice = price
    }

    // 交叉验证：会员价不能大于零售价
    const finalRetail = data.retailPrice != null ? data.retailPrice : existing.retailPrice
    const finalMember = data.memberPrice != null ? data.memberPrice : existing.memberPrice
    if (Number(finalMember) > Number(finalRetail)) {
      return errorResponse("会员价不能大于零售价", 400)
    }

    if (body.stock !== undefined) {
      data.stock = Number(body.stock)
    }

    if (body.isUpgradeProduct !== undefined) {
      data.isUpgradeProduct = body.isUpgradeProduct === true
    }

    if (body.maxPointsRatio !== undefined) {
      const ratio = Number(body.maxPointsRatio)
      if (isNaN(ratio) || ratio < 0) {
        return errorResponse("积分抵扣比例不能为负数", 400)
      }
      data.maxPointsRatio = existing.isUpgradeProduct ? 0 : Math.min(50, ratio)
    }

    if (body.benefits !== undefined) {
      if (body.benefits !== null && !Array.isArray(body.benefits)) {
        return errorResponse("benefits 必须为字符串数组", 400)
      }
      if (body.benefits && body.benefits.some((b: unknown) => typeof b !== "string")) {
        return errorResponse("benefits 数组元素必须为字符串", 400)
      }
      data.benefits = body.benefits && body.benefits.length > 0 ? body.benefits : null
    }

    if (body.status !== undefined) {
      if (!["active", "inactive"].includes(body.status)) {
        return errorResponse("status 只能为 active 或 inactive", 400)
      }
      data.status = body.status
    }

    if (body.sortOrder !== undefined) {
      data.sortOrder = Number(body.sortOrder)
    }

    // categoryId
    if (body.categoryId !== undefined) {
      if (body.categoryId) {
        const exists = await ProductService.categoryExists(body.categoryId)
        if (!exists) {
          return errorResponse("所选分类不存在", 400)
        }
      }
      data.categoryId = body.categoryId || null
    }

    // specs
    if (body.specs !== undefined) {
      if (body.specs && !Array.isArray(body.specs)) {
        return errorResponse("specs 必须为数组格式", 400)
      }
      data.specs = body.specs || null
    }

    // research
    if (body.research !== undefined) {
      data.research = body.research || null
    }

    // images
    if (body.images !== undefined) {
      if (body.images !== null && !Array.isArray(body.images)) {
        return errorResponse("images 必须为字符串数组", 400)
      }
      if (body.images && body.images.some((img: unknown) => typeof img !== "string")) {
        return errorResponse("images 数组元素必须为字符串URL", 400)
      }
      data.images = body.images && body.images.length > 0 ? body.images : null
    }

    // videoUrl
    if (body.videoUrl !== undefined) {
      data.videoUrl = body.videoUrl || null
    }

    if (Object.keys(data).length === 0) {
      return errorResponse("没有提供需要更新的字段", 400)
    }

    const product = await ProductService.updateProduct(id, data)

    // 记录操作日志
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

    return successResponse(product, "商品更新成功")
  } catch (error) {
    logger.error("Admin update product error:", error)
    return errorResponse("更新商品失败", 500)
  }
}

// DELETE /api/admin/products/[id] —— 软删除商品（设置 status='deleted'）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["goods_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { id } = await params

    // 检查商品是否存在
    const existing = await ProductService.getProductById(id)
    if (!existing) {
      return errorResponse("商品不存在", 404)
    }

    if (existing.status === "deleted") {
      return errorResponse("商品已被删除", 400)
    }

    // 软删除：设置 status='deleted'
    await ProductService.deleteProduct(id)

    // 记录操作日志
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

    return successResponse(null, "商品已删除")
  } catch (error) {
    logger.error("Admin delete product error:", error)
    return errorResponse("删除商品失败", 500)
  }
}
