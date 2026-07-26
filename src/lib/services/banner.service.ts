import { prisma } from "@/lib/prisma"

export interface BannerData {
  imageUrl: string
  link?: string
  title?: string
  alt?: string
  order?: number
}

export class BannerService {
  /** 获取所有轮播图，按 order 升序 */
  static async getAll() {
    return prisma.banners.findMany({
      orderBy: { order: "asc" },
    })
  }

  /** 创建单条轮播图，未指定 order 时自动取当前最大值 +1 */
  static async create(data: BannerData) {
    let order = data.order
    if (order === undefined || order === null) {
      const maxResult = await prisma.banners.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
      })
      order = (maxResult?.order ?? -1) + 1
    }

    return prisma.banners.create({
      data: {
        image_url: data.imageUrl,
        link: data.link || null,
        title: data.title || null,
        alt: data.alt || null,
        order,
      },
    })
  }

  /** 全量替换轮播图数组（事务：先删全部旧记录，再批量插入） */
  static async replaceAll(banners: BannerData[]) {
    return prisma.$transaction(async (tx) => {
      await tx.banners.deleteMany()

      for (const banner of banners) {
        await tx.banners.create({
          data: {
            image_url: banner.imageUrl,
            link: banner.link || null,
            title: banner.title || null,
            alt: banner.alt || null,
            order: banner.order ?? 0,
          },
        })
      }
    })
  }

  /** 删除单条轮播图（含 Supabase Storage 文件清理） */
  static async delete(id: string) {
    const existing = await prisma.banners.findUnique({ where: { id } })
    if (!existing) {
      throw new Error("轮播图不存在")
    }

    await prisma.banners.delete({ where: { id } })

    // 尝试删除 Supabase Storage 中的图片文件
    try {
      if (existing.image_url.includes(".supabase.co/storage/v1/object/public/")) {
        const { getSupabaseServerClient } = await import("@/lib/supabase/server")
        const match = existing.image_url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/)
        if (match) {
          const supabase = getSupabaseServerClient()
          await supabase.storage.from(match[1]).remove([match[2]])
        }
      }
    } catch {
      // 非致命：Storage 清理失败不影响删除结果
    }
  }
}
