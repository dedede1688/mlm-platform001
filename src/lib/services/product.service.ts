import { prisma } from '@/lib/prisma'

// 产品列表查询参数
export interface ProductListParams {
  page: number
  pageSize: number
  search?: string
  isUpgrade?: string | null
  status?: string
}

export class ProductService {
  // 获取产品列表（分页+搜索+筛选+分类关联）
  static async getAllProducts(params: ProductListParams) {
    const where: Record<string, unknown> = { status: { not: 'deleted' } }
    if (params.status) where.status = params.status
    if (params.isUpgrade !== null && params.isUpgrade !== undefined && params.isUpgrade !== '') {
      where.isUpgradeProduct = params.isUpgrade === 'true'
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { description: { contains: params.search } },
      ]
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
      prisma.product.count({ where }),
    ])

    return {
      products,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize),
    }
  }

  // 获取单个产品详情（可选分类关联）
  static async getProductById(id: string, includeCategory = false) {
    return prisma.product.findUnique({
      where: { id },
      include: includeCategory
        ? { category: { select: { id: true, name: true } } }
        : undefined,
    })
  }

  // 校验分类是否存在
  static async categoryExists(categoryId: string): Promise<boolean> {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    return cat !== null
  }

  // 创建产品（完整字段）
  static async createProduct(data: {
    name: string
    description?: string | null
    imageUrl?: string | null
    retailPrice: number
    memberPrice: number
    stock?: number
    isUpgradeProduct?: boolean
    maxPointsRatio?: number
    benefits?: string[] | null
    status?: string
    sortOrder?: number
    categoryId?: string | null
    specs?: unknown[] | null
    research?: unknown | null
    images?: string[] | null
    videoUrl?: string | null
  }) {
    return prisma.product.create({ data: data as Parameters<typeof prisma.product.create>[0]['data'] })
  }

  // 更新产品（部分字段）
  static async updateProduct(id: string, data: Record<string, unknown>) {
    return prisma.product.update({
      where: { id },
      data: data as Parameters<typeof prisma.product.update>[0]['data'],
    })
  }

  // 软删除产品
  static async deleteProduct(id: string) {
    return prisma.product.update({
      where: { id },
      data: { status: 'deleted' },
    })
  }

  // 批量更新状态
  static async bulkUpdateStatus(ids: string[], status: 'active' | 'inactive') {
    const existing = await prisma.product.findMany({
      where: { id: { in: ids }, status: { not: 'deleted' } },
      select: { id: true, name: true, status: true },
    })

    if (existing.length === 0) {
      return { updated: 0, requested: ids.length, skipped: ids.length, products: [] }
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: existing.map(p => p.id) } },
      data: { status },
    })

    return {
      updated: result.count,
      requested: ids.length,
      skipped: ids.length - existing.length,
      products: existing,
    }
  }

  // 复制产品（含 Supabase Storage 图片复制）
  static async duplicateProduct(id: string) {
    const original = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    })

    if (!original) return null

    let newImageUrl = original.imageUrl

    if (original.imageUrl) {
      try {
        const { getSupabaseServerClient } = await import('@/lib/supabase/server')
        const supabase = getSupabaseServerClient()
        const url = new URL(original.imageUrl)
        const pathParts = url.pathname.split('/object/')
        if (pathParts.length === 2) {
          const [, objectPath] = pathParts
          const ext = objectPath.split('.').pop() || 'jpg'
          const timestamp = Date.now()
          const random = Math.random().toString(36).substring(2, 8)
          const newObjectPath = objectPath.replace(/[^/]+$/, `${timestamp}-${random}.${ext}`)
          const bucketMatch = pathParts[0].replace('/storage/v1/bucket/', '')
          const { data } = await supabase.storage.from(bucketMatch).copy(objectPath, newObjectPath)
          if (data) {
            const { data: publicUrlData } = supabase.storage.from(bucketMatch).getPublicUrl(newObjectPath)
            newImageUrl = publicUrlData.publicUrl
          }
        }
      } catch {
        // 图片复制失败不阻塞流程
      }
    }

    const newProduct = await prisma.product.create({
      data: {
        name: `${original.name} - 副本`,
        description: original.description,
        imageUrl: newImageUrl,
        retailPrice: original.retailPrice,
        memberPrice: original.memberPrice,
        stock: 0,
        isUpgradeProduct: original.isUpgradeProduct ?? false,
        maxPointsRatio: original.maxPointsRatio,
        benefits: original.benefits ? (JSON.parse(JSON.stringify(original.benefits)) as string[]) : null,
        specs: original.specs ? (JSON.parse(JSON.stringify(original.specs)) as unknown[]) : null,
        research: original.research as Record<string, unknown> | null,
        images: original.images ? (JSON.parse(JSON.stringify(original.images)) as string[]) : null,
        videoUrl: original.videoUrl,
        status: 'inactive',
        sortOrder: (original.sortOrder ?? 0) + 1,
        categoryId: original.categoryId,
      } as Parameters<typeof prisma.product.create>[0]['data'],
    })

    return newProduct
  }

  // 调整库存
  static async adjustStock(id: string, quantity: number) {
    return prisma.product.update({
      where: { id },
      data: { stock: { increment: quantity } },
    })
  }
}
