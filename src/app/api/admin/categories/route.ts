import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { CategoryService } from "@/lib/services/category.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"
import { parseBody } from "@/lib/validations/helper"
import { categoryCreateSchema } from "@/lib/validations/admin/categories"

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** GET：获取所有分类 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin", "goods_admin"])
    if (authError) return authError

    const categories = await CategoryService.listAll()
    const items: CategoryItem[] = categories.map(c => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))

    return successResponse(items)
  } catch (error) {
    logger.error("获取分类列表失败:", error)
    return errorResponse("获取分类列表失败", 500)
  }
}

/** POST：创建分类 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin", "goods_admin"])
    if (authError) return authError

    const { data: body, error: parseError } = await parseBody(categoryCreateSchema, request)
    if (parseError) return parseError

    const category = await CategoryService.create({
      name: body.name,
      parentId: body.parentId || undefined,
      sortOrder: body.sortOrder,
    })

    return successResponse({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })
  } catch (error) {
    logger.error("创建分类失败:", error)
    return errorResponse(error instanceof Error ? error.message : "创建分类失败", 500)
  }
}
