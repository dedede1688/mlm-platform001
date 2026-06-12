import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

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
    const { error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError) return authError

    const records = await prisma.banners.findMany({
      orderBy: { order: 'asc' },
    })

    const banners = records.map(toBannerItem)

    return NextResponse.json<ApiResponse<BannerItem[]>>({
      success: true,
      data: banners,
    })
  } catch (error) {
    console.error('获取轮播图列表失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '获取轮播图列表失败' },
      { status: 500 }
    )
  }
}

/** POST：新增单条轮播图 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin'])
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
        { success: false, error: 'imageUrl 必填' },
        { status: 400 }
      )
    }

    // 如果没有指定 order，取当前最大值 +1
    let order = body.order
    if (order === undefined || order === null) {
      const maxResult = await prisma.banners.findFirst({
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      order = (maxResult?.order ?? -1) + 1
    }

    const record = await prisma.banners.create({
      data: {
        image_url: body.imageUrl,
        link: body.link || null,
        title: body.title || null,
        alt: body.alt || null,
        order,
      },
    })

    return NextResponse.json<ApiResponse<BannerItem>>(
      { success: true, data: toBannerItem(record) },
      { status: 201 }
    )
  } catch (error) {
    console.error('创建轮播图失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '创建轮播图失败' },
      { status: 500 }
    )
  }
}

/** PUT：全量更新 banners 数组 */
export async function PUT(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError) return authError

    const body = await request.json() as { banners?: BannerItem[] }
    const newBanners = body.banners || []

    // 基本验证
    for (const banner of newBanners) {
      if (!banner.imageUrl) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: '每条轮播图必须有 imageUrl' },
          { status: 400 }
        )
      }
    }

    // 使用事务：先删除所有旧记录，再批量插入新记录
    const result = await prisma.$transaction(async (tx) => {
      // 删除所有旧记录
      await tx.banners.deleteMany()

      // 批量插入新记录
      const created: BannerItem[] = []
      for (const banner of newBanners) {
        const record = await tx.banners.create({
          data: {
            image_url: banner.imageUrl,
            link: banner.link || null,
            title: banner.title || null,
            alt: banner.alt || null,
            order: banner.order ?? 0,
          },
        })
        created.push(toBannerItem(record))
      }

      return created
    })

    return NextResponse.json<ApiResponse<BannerItem[]>>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('保存轮播图失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '保存轮播图失败' },
      { status: 500 }
    )
  }
}

/** DELETE：删除单条轮播图 */
export async function DELETE(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '缺少 id 参数' },
        { status: 400 }
      )
    }

    // 先查找记录
    const existing = await prisma.banners.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '轮播图不存在' },
        { status: 404 }
      )
    }

    // 删除记录
    await prisma.banners.delete({ where: { id } })

    // 可选：删除 Supabase Storage 中的图片文件
    try {
      if (existing.image_url.includes('.supabase.co/storage/v1/object/public/')) {
        const { getSupabaseServerClient } = await import('@/lib/supabase/server')
        const match = existing.image_url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/)
        if (match) {
          const supabase = getSupabaseServerClient()
          await supabase.storage.from(match[1]).remove([match[2]])
        }
      }
    } catch (storageErr) {
      console.error('删除 Storage 文件失败（非致命）:', storageErr)
    }

    return NextResponse.json<ApiResponse<never>>({
      success: true,
    })
  } catch (error) {
    console.error('删除轮播图失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '删除轮播图失败' },
      { status: 500 }
    )
  }
}