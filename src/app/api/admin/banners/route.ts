import { logger } from '@/lib/logger'
import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { BannerService } from "@/lib/services/banner.service"
import { errorResponse, successResponse } from "@/lib/api-response"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { parseBody } from "@/lib/validations/helper"
import { bannerCreateSchema, bannerReplaceSchema } from "@/lib/validations/admin/banners"

// ---- 类型定义 ----

interface BannerItem {
  id: string
  imageUrl: string
  link?: string
  title?: string
  alt?: string
  order: number
}

/** 将数据库记录转换为前端 BannerItem 格式 */
function toBannerItem(record: {
  id: string
  image_url: string
  link: string | null
  title: string | null
  alt: string | null
  order: number | null
}): BannerItem {
  return {
    id: record.id,
    imageUrl: record.image_url,
    link: record.link ?? undefined,
    title: record.title ?? undefined,
    alt: record.alt ?? undefined,
    order: record.order ?? 0,
  }
}

/** GET：获取所有轮播图，按 order 升序 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError) return authError

    const records = await BannerService.getAll()
    const banners = records.map(toBannerItem)

    return successResponse(banners)
  } catch (error) {
    logger.error("获取轮播图列表失败", error)
    return errorResponse("获取轮播图列表失败", 500)
  }
}

/** POST：新增单条轮播图 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError) return authError

    const { data: body, error: parseError } = await parseBody(bannerCreateSchema, request)
    if (parseError) return parseError

    const record = await BannerService.create({
      imageUrl: body.imageUrl,
      link: body.link,
      title: body.title,
      alt: body.alt,
      order: body.order,
    })

    return successResponse(toBannerItem(record))
  } catch (error) {
    logger.error("创建轮播图失败", error)
    return errorResponse("创建轮播图失败", 500)
  }
}

/** PUT：全量更新 banners 数组（事务：先删全部旧记录，再批量插入） */
export async function PUT(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError) return authError

    const { data: body, error: parseError } = await parseBody(bannerReplaceSchema, request)
    if (parseError) return parseError

    await BannerService.replaceAll(body.banners)

    return successResponse([])
  } catch (error) {
    logger.error("保存轮播图失败", error)
    return errorResponse("保存轮播图失败", 500)
  }
}

/** DELETE：删除单条轮播图 */
export async function DELETE(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return errorResponse("缺少 id 参数", 400)
    }

    await BannerService.delete(id)

    return successResponse(null)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : ""
    if (errMsg === "轮播图不存在") {
      return errorResponse("轮播图不存在", 404)
    }
    logger.error("删除轮播图失败", error)
    return errorResponse("删除轮播图失败", 500)
  }
}
