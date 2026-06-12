import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// ---- 类型定义 ----

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/** PUT：更新分类 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError) return authError

    const { id } = await params
    const body = await request.json() as {
      name?: string
      parentId?: string | null
      sortOrder?: number
    }

    // 检查分类是否存在
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '分类不存在' },
        { status: 404 }
      )
    }

    // 如果指定了 parentId，防止自引用
    if (body.parentId === id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '不能将自身设为父分类' },
        { status: 400 }
      )
    }

    // 验证父分类存在
    if (body.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: body.parentId } })
      if (!parent) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: '父分类不存在' },
          { status: 400 }
        )
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? undefined,
        parentId: body.parentId !== undefined ? (body.parentId || null) : undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
    })

    return NextResponse.json<ApiResponse<CategoryItem>>({
      success: true,
      data: {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('更新分类失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '更新分类失败' },
      { status: 500 }
    )
  }
}

/** DELETE：删除分类 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError) return authError

    const { id } = await params

    // 检查分类是否存在
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '分类不存在' },
        { status: 404 }
      )
    }

    // 检查是否有子分类
    const childCount = await prisma.category.count({ where: { parentId: id } })
    if (childCount > 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: `该分类下有 ${childCount} 个子分类，无法删除` },
        { status: 400 }
      )
    }

    // 检查是否有关联商品
    const productCount = await prisma.product.count({ where: { categoryId: id } })
    if (productCount > 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: `该分类下有 ${productCount} 个商品，无法删除` },
        { status: 400 }
      )
    }

    await prisma.category.delete({ where: { id } })

    return NextResponse.json<ApiResponse<never>>({ success: true })
  } catch (error) {
    console.error('删除分类失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '删除分类失败' },
      { status: 500 }
    )
  }
}