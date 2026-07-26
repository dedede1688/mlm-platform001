import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { ProductService } from '@/lib/services/product.service'

// GET /api/admin/products —— 获取商品列表（分页、搜索、筛选）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))
    const search = searchParams.get('search')?.trim() || ''
    const isUpgrade = searchParams.get('isUpgrade')
    const status = searchParams.get('status') || ''

    const result = await ProductService.getAllProducts({
      page,
      pageSize,
      search: search || undefined,
      isUpgrade,
      status: status || undefined,
    })

    return NextResponse.json({
      success: true,
      data: result.products,
      message: '获取商品列表成功',
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    })
  } catch (error) {
    logger.error('Admin get products error:', error)
    return NextResponse.json(
      { success: false, message: '获取商品列表失败' },
      { status: 500 }
    )
  }
}

// POST /api/admin/products —— 创建新商品
export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()
    const {
      name,
      description,
      imageUrl,
      retailPrice,
      memberPrice,
      stock,
      isUpgradeProduct,
      maxPointsRatio,
      benefits,
      status,
      sortOrder,
      categoryId,
      specs,
      research,
      images,
      videoUrl,
    } = body

    // 验证必填字段
    if (!name || retailPrice == null || memberPrice == null) {
      return NextResponse.json(
        { success: false, message: '商品名称、零售价和会员价不能为空' },
        { status: 400 }
      )
    }

    if (retailPrice <= 0 || memberPrice <= 0) {
      return NextResponse.json(
        { success: false, message: '价格必须大于0' },
        { status: 400 }
      )
    }

    if (memberPrice > retailPrice) {
      return NextResponse.json(
        { success: false, message: '会员价不能大于零售价' },
        { status: 400 }
      )
    }

    // 验证 benefits 格式
    if (benefits != null && !Array.isArray(benefits)) {
      return NextResponse.json(
        { success: false, message: 'benefits 必须为字符串数组' },
        { status: 400 }
      )
    }
    if (Array.isArray(benefits) && benefits.some((b: unknown) => typeof b !== 'string')) {
      return NextResponse.json(
        { success: false, message: 'benefits 数组元素必须为字符串' },
        { status: 400 }
      )
    }

    // 验证 status
    if (status && !['active', 'inactive'].includes(status)) {
      return NextResponse.json(
        { success: false, message: 'status 只能为 active 或 inactive' },
        { status: 400 }
      )
    }

    // 验证 categoryId 存在性
    if (categoryId) {
      const exists = await ProductService.categoryExists(categoryId)
      if (!exists) {
        return NextResponse.json(
          { success: false, message: '所选分类不存在' },
          { status: 400 }
        )
      }
    }

    // 验证 specs 格式（应为数组）
    if (specs != null && !Array.isArray(specs)) {
      return NextResponse.json(
        { success: false, message: 'specs 必须为数组格式' },
        { status: 400 }
      )
    }

    // 验证 research 格式（应为对象）
    if (research != null && typeof research !== 'object') {
      return NextResponse.json(
        { success: false, message: 'research 必须为对象格式' },
        { status: 400 }
      )
    }

    // 验证 images 格式
    if (images != null && !Array.isArray(images)) {
      return NextResponse.json(
        { success: false, message: 'images 必须为字符串数组' },
        { status: 400 }
      )
    }

    const product = await ProductService.createProduct({
      name,
      description: description || null,
      imageUrl: imageUrl || null,
      retailPrice,
      memberPrice,
      stock: stock || 0,
      isUpgradeProduct: isUpgradeProduct || false,
      maxPointsRatio: maxPointsRatio ?? 0,
      benefits: benefits?.length ? benefits : null,
      status: status === 'active' ? 'active' : 'inactive',
      sortOrder: sortOrder ?? 0,
      categoryId: categoryId || null,
      specs: specs || null,
      research: research || null,
      images: images || null,
      videoUrl: videoUrl || null,
    })

    // 记录操作日志
    await logOperation({
      userId: admin.id,
      action: 'CREATE',
      module: 'product',
      targetId: product.id,
      newValue: { name: product.name },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({
      success: true,
      data: product,
      message: '商品创建成功',
    }, { status: 201 })
  } catch (error) {
    logger.error('Admin create product error:', error)
    return NextResponse.json(
      { success: false, message: '创建商品失败' },
      { status: 500 }
    )
  }
}
