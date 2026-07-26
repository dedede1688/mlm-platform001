import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { BannerService } from "@/lib/services/banner.service"

// ---- 类型定义 ----

interface BannerItem {
  id: string
  imageUrl: string
  link?: string
  title?: string
  alt?: string
  order: number
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
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

    return NextResponse.json<ApiResponse<BannerItem[]>>({
      success: true,
      data: banners,
    })
  } catch (error) {
    console.error("获取轮播图列表失败", error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "获取轮播图列表失败" },
      { status: 500 }
    )
  }
}

/** POST：新增单条轮播图 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError) return authError

    const body = await request.json() as {
      imageUrl?: string
      link?: string
      title?: string
      alt?: string
      order?: number
    }

    if (!body.imageUrl) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "imageUrl 必填" },
        { status: 400 }
      )
    }

    const record = await BannerService.create({
      imageUrl: body.imageUrl,
      link: body.link,
      title: body.title,
      alt: body.alt,
      order: body.order,
    })

    return NextResponse.json<ApiResponse<BannerItem>>(
      { success: true, data: toBannerItem(record) },
      { status: 201 }
    )
  } catch (error) {
    console.error("创建轮播图失败", error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "创建轮播图失败" },
      { status: 500 }
    )
  }
}

/** PUT：全量更新 banners 数组（事务：先删全部旧记录，再批量插入） */
export async function PUT(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ["super_admin"])
    if (authError) return authError

    const body = await request.json() as { banners?: BannerItem[] }
    const newBanners = body.banners || []

    // 基本验证
    for (const banner of newBanners) {
      if (!banner.imageUrl) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: "每条轮播图必须有 imageUrl" },
          { status: 400 }
        )
      }
    }

    await BannerService.replaceAll(newBanners)

    return NextResponse.json<ApiResponse<BannerItem[]>>({
      success: true,
      data: [],
    })
  } catch (error) {
    console.error("保存轮播图失败", error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "保存轮播图失败" },
      { status: 500 }
    )
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
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "缺少 id 参数" },
        { status: 400 }
      )
    }

    await BannerService.delete(id)

    return NextResponse.json<ApiResponse<never>>({
      success: true,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : ""
    if (errMsg === "轮播图不存在") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "轮播图不存在" },
        { status: 404 }
      )
    }
    console.error("删除轮播图失败", error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "删除轮播图失败" },
      { status: 500 }
    )
  }
}
