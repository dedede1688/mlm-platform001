import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { CategoryService } from '@/lib/services/category.service'
import { logger } from '@/lib/logger'

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

    const category = await CategoryService.update(id, {
      name: body.name,
      parentId: body.parentId,
      sortOrder: body.sortOrder,
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
    logger.error('更新分类失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: error instanceof Error ? error.message : '更新分类失败' },
      { status: error instanceof Error && error.message === '分类不存在' ? 404 : 500 }
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
    await CategoryService.delete(id)

    return NextResponse.json<ApiResponse<never>>({ success: true })
  } catch (error) {
    logger.error('删除分类失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: error instanceof Error ? error.message : '删除分类失败' },
      { status: 500 }
    )
  }
}
