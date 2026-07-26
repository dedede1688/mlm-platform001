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

/** GET：获取所有分类 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
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

    return NextResponse.json<ApiResponse<CategoryItem[]>>({
      success: true,
      data: items,
    })
  } catch (error) {
    logger.error('获取分类列表失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '获取分类列表失败' },
      { status: 500 }
    )
  }
}

/** POST：创建分类 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError) return authError

    const body = await request.json() as {
      name?: string
      parentId?: string | null
      sortOrder?: number
    }

    if (!body.name || !body.name.trim()) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '分类名称必填' },
        { status: 400 }
      )
    }

    const category = await CategoryService.create({
      name: body.name.trim(),
      parentId: body.parentId || undefined,
      sortOrder: body.sortOrder,
    })

    return NextResponse.json<ApiResponse<CategoryItem>>(
      { success: true, data: {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      } },
      { status: 201 }
    )
  } catch (error) {
    logger.error('创建分类失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: error instanceof Error ? error.message : '创建分类失败' },
      { status: 500 }
    )
  }
}
